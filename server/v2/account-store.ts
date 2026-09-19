import { createHash, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { ApiError } from './errors.ts';
import type { Profile } from '../../contracts/v2.ts';

const token = () => randomBytes(32).toString('base64url');
const digest = (raw: string) => createHash('sha256').update(raw).digest('hex');
const WEEK = 7 * 86400_000;
export const ACCOUNT_SCHEMA_VERSION = 3;
export interface Account { id: string; username: string; passwordHash: string; disabledAt: number | null }
export interface AccountSession { id: string; userId: string; expiresAt: number }

/** Separate from game audit storage. Raw invitations, reset tokens and session tokens are never persisted. */
export class AccountStore {
  readonly db: DatabaseSync;
  readonly now: () => number;
  // Public profile fields only; mutable fields are committed via replaceAvatar. Never cache sessions/passwords.
  private readonly profiles = new Map<string, Profile>();
  constructor(path: string, now: () => number = Date.now) {
    this.now = now;
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    this.db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)');
    const version = this.db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()?.version ?? 0;
    if (Number(version) > ACCOUNT_SCHEMA_VERSION) { this.db.close(); throw new Error('Unsupported account schema version'); }
    if (version === 0) this.transaction(() => {
      this.db.exec(`
        CREATE TABLE accounts (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
        CREATE TABLE invitations (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, purpose TEXT NOT NULL CHECK(purpose IN ('register','reset')), user_id TEXT REFERENCES accounts(id), expires_at INTEGER NOT NULL, used_at INTEGER);
        CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES accounts(id), expires_at INTEGER NOT NULL);
        CREATE INDEX sessions_user ON sessions(user_id);
        INSERT INTO schema_migrations VALUES(1);
      `);
    });
    if (Number(version) < 2) this.transaction(() => {
      this.db.exec(`
        CREATE TABLE avatar_assets (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, unreferenced_at INTEGER);
        ALTER TABLE accounts ADD COLUMN avatar_id TEXT REFERENCES avatar_assets(id);
        ALTER TABLE accounts ADD COLUMN profile_version INTEGER NOT NULL DEFAULT 0;
        INSERT INTO schema_migrations VALUES(2);
      `);
    });
    if (Number(version) < 3) this.transaction(() => {
      this.db.exec(`
        ALTER TABLE accounts ADD COLUMN disabled_at INTEGER;
        ALTER TABLE invitations ADD COLUMN created_at INTEGER;
        ALTER TABLE invitations ADD COLUMN revoked_at INTEGER;
        UPDATE invitations SET created_at=expires_at-CASE purpose WHEN 'register' THEN ${WEEK} ELSE 1800000 END WHERE created_at IS NULL;
        CREATE TABLE admin_actions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          action TEXT NOT NULL,
          target_type TEXT NOT NULL CHECK(target_type IN ('account','invitation','auth')),
          target_id TEXT,
          at INTEGER NOT NULL,
          details_json TEXT NOT NULL
        );
        INSERT INTO schema_migrations VALUES(3);
      `);
    });
  }
  transaction<T>(action: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = action(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  byName(username: string): Account | null {
    const row = this.db.prepare('SELECT id, username, password_hash, disabled_at FROM accounts WHERE username=?').get(username.toLowerCase());
    return row ? { id: String(row.id), username: String(row.username), passwordHash: String(row.password_hash), disabledAt: row.disabled_at === null ? null : Number(row.disabled_at) } : null;
  }
  profile(userId: string): Profile {
    const cached = this.profiles.get(userId);
    if (cached) return { ...cached };
    const profile = this.readProfile(userId);
    this.rememberProfile(profile);
    return profile;
  }
  private rememberProfile(profile: Profile): void {
    this.profiles.delete(profile.userId);
    if (this.profiles.size >= 2048) this.profiles.delete(this.profiles.keys().next().value!);
    this.profiles.set(profile.userId, { ...profile });
  }
  private readProfile(userId: string): Profile {
    const row = this.db.prepare('SELECT username,avatar_id,profile_version FROM accounts WHERE id=?').get(userId);
    if (!row) throw new ApiError(404, 'account_not_found');
    return { userId, username: String(row.username), avatarUrl: row.avatar_id === null ? null : `/api/v2/avatars/${row.avatar_id}`, profileVersion: Number(row.profile_version) };
  }
  replaceAvatar(userId: string, assetId: string): Profile {
    const profile = this.transaction(() => {
      const old = this.db.prepare('SELECT avatar_id FROM accounts WHERE id=?').get(userId);
      if (!old) throw new ApiError(404, 'account_not_found');
      this.db.prepare('INSERT INTO avatar_assets(id,created_at,unreferenced_at) VALUES(?,?,NULL)').run(assetId, this.now());
      this.db.prepare('UPDATE accounts SET avatar_id=?,profile_version=profile_version+1 WHERE id=?').run(assetId, userId);
      if (old.avatar_id !== null) this.db.prepare('UPDATE avatar_assets SET unreferenced_at=? WHERE id=?').run(this.now(), old.avatar_id);
      return this.readProfile(userId);
    });
    // Only publish a committed profile. Failed updates leave the old cached value intact.
    this.rememberProfile(profile);
    return profile;
  }
  clearAvatar(userId: string): Profile {
    const profile = this.transaction(() => {
      const old = this.db.prepare('SELECT avatar_id FROM accounts WHERE id=?').get(userId);
      if (!old) throw new ApiError(404, 'account_not_found');
      this.db.prepare('UPDATE accounts SET avatar_id=NULL,profile_version=profile_version+1 WHERE id=?').run(userId);
      if (old.avatar_id !== null) this.db.prepare('UPDATE avatar_assets SET unreferenced_at=? WHERE id=?').run(this.now(), old.avatar_id);
      return this.readProfile(userId);
    });
    this.rememberProfile(profile); return profile;
  }
  rename(userId: string, username: string): Profile {
    const normalized = username.toLowerCase();
    if (!/^[a-z0-9_]{3,32}$/.test(normalized)) throw new ApiError(400, 'invalid_username');
    try {
      const profile = this.transaction(() => {
        if (!this.db.prepare('SELECT id FROM accounts WHERE id=?').get(userId)) throw new ApiError(404, 'account_not_found');
        this.db.prepare('UPDATE accounts SET username=?,profile_version=profile_version+1 WHERE id=?').run(normalized, userId);
        return this.readProfile(userId);
      });
      this.rememberProfile(profile); return profile;
    } catch (error) {
      if ((error as { code?: string }).code === 'ERR_SQLITE_CONSTRAINT_UNIQUE' || String(error).includes('UNIQUE constraint failed: accounts.username')) throw new ApiError(409, 'username_taken');
      throw error;
    }
  }
  disable(userId: string): number {
    const at = this.now();
    this.transaction(() => {
      const result = this.db.prepare('UPDATE accounts SET disabled_at=? WHERE id=? AND disabled_at IS NULL').run(at, userId);
      if (Number(result.changes) === 0) {
        if (!this.db.prepare('SELECT id FROM accounts WHERE id=?').get(userId)) throw new ApiError(404, 'account_not_found');
        throw new ApiError(409, 'account_already_disabled');
      }
      this.db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
    });
    return at;
  }
  enable(userId: string): void {
    const result = this.db.prepare('UPDATE accounts SET disabled_at=NULL WHERE id=? AND disabled_at IS NOT NULL').run(userId);
    if (Number(result.changes) === 0) {
      if (!this.db.prepare('SELECT id FROM accounts WHERE id=?').get(userId)) throw new ApiError(404, 'account_not_found');
      throw new ApiError(409, 'account_already_enabled');
    }
  }
  revokeSessions(userId: string): number {
    if (!this.db.prepare('SELECT id FROM accounts WHERE id=?').get(userId)) throw new ApiError(404, 'account_not_found');
    return Number(this.db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId).changes);
  }
  invite(purpose: 'register' | 'reset' = 'register', username?: string, ttl = purpose === 'register' ? WEEK : 1800_000) {
    const user = purpose === 'reset' ? this.byName(username ?? '') : null;
    if (purpose === 'reset' && !user) throw new ApiError(404, 'account_not_found');
    if (!Number.isSafeInteger(ttl) || ttl < 5 * 60_000 || ttl > 30 * 86400_000) throw new ApiError(400, 'invalid_expiry');
    const raw = token(); const id = token(); const expiresAt = this.now() + ttl;
    this.db.prepare('INSERT INTO invitations(id,token_hash,purpose,user_id,expires_at,used_at,created_at,revoked_at) VALUES(?,?,?,?,?,NULL,?,NULL)').run(id, digest(raw), purpose, user?.id ?? null, expiresAt, this.now());
    return { id, token: raw, expiresAt, purpose };
  }
  revokeInvite(id: string) {
    const result = this.db.prepare('UPDATE invitations SET revoked_at=? WHERE id=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?').run(this.now(), id, this.now());
    if (Number(result.changes) === 0) throw new ApiError(409, 'invitation_not_active');
  }
  updateInviteExpiry(id: string, expiresAt: number): void {
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= this.now() + 60_000 || expiresAt > this.now() + 30 * 86400_000) throw new ApiError(400, 'invalid_expiry');
    const result = this.db.prepare('UPDATE invitations SET expires_at=? WHERE id=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?').run(expiresAt, id, this.now());
    if (Number(result.changes) === 0) throw new ApiError(409, 'invitation_not_active');
  }
  regenerateInvite(id: string, ttl: number) {
    return this.transaction(() => {
      const row = this.db.prepare('SELECT purpose,user_id FROM invitations WHERE id=?').get(id);
      if (!row) throw new ApiError(404, 'invitation_not_found');
      this.db.prepare('UPDATE invitations SET revoked_at=? WHERE id=? AND used_at IS NULL AND revoked_at IS NULL').run(this.now(), id);
      const raw = token(), nextId = token(), expiresAt = this.now() + ttl;
      this.db.prepare('INSERT INTO invitations(id,token_hash,purpose,user_id,expires_at,used_at,created_at,revoked_at) VALUES(?,?,?,?,?,NULL,?,NULL)').run(nextId, digest(raw), row.purpose, row.user_id, expiresAt, this.now());
      return { id: nextId, token: raw, expiresAt, purpose: String(row.purpose) as 'register' | 'reset' };
    });
  }
  validInvite(raw: string, purpose: 'register' | 'reset') {
    return this.db.prepare('SELECT id,user_id FROM invitations WHERE token_hash=? AND purpose=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?').get(digest(raw), purpose, this.now()) ?? null;
  }
  register(username: string, passwordHash: string, invitation: string) {
    const normalized = username.toLowerCase();
    if (!/^[a-z0-9_]{3,32}$/.test(normalized)) throw new ApiError(400, 'invalid_username');
    return this.transaction(() => {
      const invite = this.validInvite(invitation, 'register');
      if (!invite) throw new ApiError(403, 'invalid_invitation');
      if (this.byName(normalized)) throw new ApiError(409, 'username_taken');
      const account = { id: token(), username: normalized, passwordHash, disabledAt: null };
      this.db.prepare('INSERT INTO accounts(id,username,password_hash,created_at) VALUES(?,?,?,?)').run(account.id, normalized, passwordHash, this.now());
      this.db.prepare('UPDATE invitations SET used_at=? WHERE id=?').run(this.now(), invite.id);
      return account;
    });
  }
  resetPassword(raw: string, passwordHash: string): string {
    return this.transaction(() => {
      const invite = this.validInvite(raw, 'reset');
      if (!invite) throw new ApiError(403, 'invalid_reset_token');
      const userId = String(invite.user_id);
      this.db.prepare('UPDATE accounts SET password_hash=? WHERE id=?').run(passwordHash, userId);
      this.db.prepare("UPDATE invitations SET revoked_at=? WHERE user_id=? AND purpose='reset' AND used_at IS NULL AND id<>?").run(this.now(), userId, invite.id);
      this.db.prepare('UPDATE invitations SET used_at=? WHERE id=?').run(this.now(), invite.id);
      this.db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
      return userId;
    });
  }
  changePassword(userId: string, hash: string) {
    this.transaction(() => { this.db.prepare('UPDATE accounts SET password_hash=? WHERE id=?').run(hash, userId); this.db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId); });
  }
  createSession(userId: string) {
    if (!this.db.prepare('SELECT id FROM accounts WHERE id=? AND disabled_at IS NULL').get(userId)) throw new ApiError(403, 'account_disabled');
    const raw = token(); const session = { id: digest(raw), userId, expiresAt: this.now() + WEEK };
    this.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(session.id, userId, session.expiresAt);
    return { token: raw, session };
  }
  session(raw: string): AccountSession | null {
    const row = this.db.prepare('SELECT s.* FROM sessions s JOIN accounts a ON a.id=s.user_id WHERE s.id=? AND s.expires_at>? AND a.disabled_at IS NULL').get(digest(raw), this.now());
    return row ? { id: String(row.id), userId: String(row.user_id), expiresAt: Number(row.expires_at) } : null;
  }
  sessionActive(id: string): boolean { return this.db.prepare('SELECT s.id FROM sessions s JOIN accounts a ON a.id=s.user_id WHERE s.id=? AND s.expires_at>? AND a.disabled_at IS NULL').get(id, this.now()) !== undefined; }
  recordAdminAction(action: string, targetType: 'account' | 'invitation' | 'auth', targetId: string | null, details: Record<string, string | number | boolean | null> = {}) {
    this.db.prepare('INSERT INTO admin_actions(action,target_type,target_id,at,details_json) VALUES(?,?,?,?,?)').run(action, targetType, targetId, this.now(), JSON.stringify(details));
  }
  logout(id: string) { this.db.prepare('DELETE FROM sessions WHERE id=?').run(id); }
  collectExpired() { this.db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(this.now()); }
  close() { this.profiles.clear(); this.db.close(); }
}
