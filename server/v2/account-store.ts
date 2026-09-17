import { createHash, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { ApiError } from './errors.ts';

const token = () => randomBytes(32).toString('base64url');
const digest = (raw: string) => createHash('sha256').update(raw).digest('hex');
const WEEK = 7 * 86400_000;
export interface Account { id: string; username: string; passwordHash: string }
export interface AccountSession { id: string; userId: string; expiresAt: number }

/** Separate from game audit storage. Raw invitations, reset tokens and session tokens are never persisted. */
export class AccountStore {
  readonly db: DatabaseSync;
  readonly now: () => number;
  constructor(path: string, now: () => number = Date.now) {
    this.now = now;
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    this.db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)');
    const version = this.db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()?.version ?? 0;
    if (Number(version) > 1) { this.db.close(); throw new Error('Unsupported account schema version'); }
    if (version === 0) this.transaction(() => {
      this.db.exec(`
        CREATE TABLE accounts (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
        CREATE TABLE invitations (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, purpose TEXT NOT NULL CHECK(purpose IN ('register','reset')), user_id TEXT REFERENCES accounts(id), expires_at INTEGER NOT NULL, used_at INTEGER);
        CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES accounts(id), expires_at INTEGER NOT NULL);
        CREATE INDEX sessions_user ON sessions(user_id);
        INSERT INTO schema_migrations VALUES(1);
      `);
    });
  }
  transaction<T>(action: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = action(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  byName(username: string): Account | null {
    const row = this.db.prepare('SELECT id, username, password_hash FROM accounts WHERE username=?').get(username.toLowerCase());
    return row ? { id: String(row.id), username: String(row.username), passwordHash: String(row.password_hash) } : null;
  }
  invite(purpose: 'register' | 'reset' = 'register', username?: string, ttl = purpose === 'register' ? WEEK : 1800_000) {
    const user = purpose === 'reset' ? this.byName(username ?? '') : null;
    if (purpose === 'reset' && !user) throw new ApiError(404, 'account_not_found');
    if (!Number.isFinite(ttl) || ttl <= 0) throw new ApiError(400, 'invalid_expiry');
    const raw = token(); const id = token(); const expiresAt = this.now() + ttl;
    this.db.prepare('INSERT INTO invitations VALUES(?,?,?,?,?,NULL)').run(id, digest(raw), purpose, user?.id ?? null, expiresAt);
    return { id, token: raw, expiresAt };
  }
  revokeInvite(id: string) { this.db.prepare('UPDATE invitations SET used_at=? WHERE id=? AND used_at IS NULL').run(this.now(), id); }
  validInvite(raw: string, purpose: 'register' | 'reset') {
    return this.db.prepare('SELECT id,user_id FROM invitations WHERE token_hash=? AND purpose=? AND used_at IS NULL AND expires_at>?').get(digest(raw), purpose, this.now()) ?? null;
  }
  register(username: string, passwordHash: string, invitation: string) {
    const normalized = username.toLowerCase();
    if (!/^[a-z0-9_]{3,32}$/.test(normalized)) throw new ApiError(400, 'invalid_username');
    return this.transaction(() => {
      const invite = this.validInvite(invitation, 'register');
      if (!invite) throw new ApiError(403, 'invalid_invitation');
      if (this.byName(normalized)) throw new ApiError(409, 'username_taken');
      const account = { id: token(), username: normalized, passwordHash };
      this.db.prepare('INSERT INTO accounts VALUES(?,?,?,?)').run(account.id, normalized, passwordHash, this.now());
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
      this.db.prepare("UPDATE invitations SET used_at=? WHERE user_id=? AND purpose='reset' AND used_at IS NULL").run(this.now(), userId);
      this.db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
      return userId;
    });
  }
  changePassword(userId: string, hash: string) {
    this.transaction(() => { this.db.prepare('UPDATE accounts SET password_hash=? WHERE id=?').run(hash, userId); this.db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId); });
  }
  createSession(userId: string) {
    const raw = token(); const session = { id: digest(raw), userId, expiresAt: this.now() + WEEK };
    this.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(session.id, userId, session.expiresAt);
    return { token: raw, session };
  }
  session(raw: string): AccountSession | null {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id=? AND expires_at>?').get(digest(raw), this.now());
    return row ? { id: String(row.id), userId: String(row.user_id), expiresAt: Number(row.expires_at) } : null;
  }
  sessionActive(id: string): boolean { return this.db.prepare('SELECT id FROM sessions WHERE id=? AND expires_at>?').get(id, this.now()) !== undefined; }
  logout(id: string) { this.db.prepare('DELETE FROM sessions WHERE id=?').run(id); }
  collectExpired() { this.db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(this.now()); }
  close() { this.db.close(); }
}
