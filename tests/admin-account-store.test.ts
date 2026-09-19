import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AccountStore } from '../server/v2/account-store.ts';

const directories: string[] = [];
const stores: AccountStore[] = [];
const digest = (raw: string) => createHash('sha256').update(raw).digest('hex');

afterEach(() => {
  for (const store of stores.splice(0).reverse()) store.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function seedSchemaTwo(path: string, now: number): void {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY);
    INSERT INTO schema_migrations VALUES (1), (2);
    CREATE TABLE accounts (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL, avatar_id TEXT, profile_version INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE avatar_assets (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, unreferenced_at INTEGER);
    CREATE TABLE invitations (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, purpose TEXT NOT NULL CHECK(purpose IN ('register','reset')), user_id TEXT REFERENCES accounts(id), expires_at INTEGER NOT NULL, used_at INTEGER);
    CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES accounts(id), expires_at INTEGER NOT NULL);
    CREATE INDEX sessions_user ON sessions(user_id);
  `);
  db.prepare('INSERT INTO accounts VALUES (?,?,?,?,?,?)').run('legacy-account', 'legacy_admin_target', 'hash:legacy', now, 'old-avatar', 4);
  db.prepare('INSERT INTO avatar_assets VALUES (?,?,?)').run('old-avatar', now - 100, null);
  db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(digest('legacy-session'), 'legacy-account', now + 86_400_000);
  db.prepare('INSERT INTO invitations VALUES (?,?,?,?,?,NULL)').run('legacy-invite', digest('legacy-invite-token'), 'register', null, now + 86_400_000);
  db.close();
}

function storeMethod<T>(store: AccountStore, name: string, ...args: unknown[]): T {
  const method = (store as unknown as Record<string, unknown>)[name];
  expect(typeof method, `AccountStore.${name} is required by the admin contract`).toBe('function');
  return (method as (...values: unknown[]) => T).apply(store, args);
}

describe('admin account-store v3 contract', () => {
  it('migrates schema v2 to v3 without losing profiles, avatars, invites, or sessions', () => {
    const directory = mkdtempSync(join(tmpdir(), 'theater-admin-store-migration-')); directories.push(directory);
    const path = join(directory, 'accounts.sqlite');
    seedSchemaTwo(path, 10_000);
    const store = new AccountStore(path, () => 10_000); stores.push(store);
    expect(Number(store.db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()!.version)).toBe(3);
    const accountColumns = new Set((store.db.prepare('PRAGMA table_info(accounts)').all() as Array<{ name: string }>).map(row => row.name));
    const inviteColumns = new Set((store.db.prepare('PRAGMA table_info(invitations)').all() as Array<{ name: string }>).map(row => row.name));
    expect(accountColumns.has('disabled_at')).toBe(true);
    expect(inviteColumns.has('created_at')).toBe(true);
    expect(inviteColumns.has('revoked_at')).toBe(true);
    expect(store.byName('legacy_admin_target')).toMatchObject({ id: 'legacy-account', username: 'legacy_admin_target' });
    expect(store.profile('legacy-account')).toMatchObject({ avatarUrl: '/api/v2/avatars/old-avatar', profileVersion: 4 });
    expect(store.session('legacy-session')).toMatchObject({ userId: 'legacy-account' });
    expect(store.validInvite('legacy-invite-token', 'register')).toMatchObject({ id: 'legacy-invite' });
  });

  it('disables accounts, rejects their sessions, revokes every session, and clears avatar metadata', () => {
    const store = new AccountStore(':memory:', () => 20_000); stores.push(store);
    const account = store.register('disable_target', 'hash:password', store.invite().token);
    const first = store.createSession(account.id); const second = store.createSession(account.id);
    storeMethod(store, 'replaceAvatar', account.id, 'asset-admin');
    storeMethod(store, 'disable', account.id);
    expect(store.byName(account.username)?.disabledAt).toBeTypeOf('number');
    expect(store.session(first.token)).toBeNull();
    expect(store.session(second.token)).toBeNull();
    expect(() => store.createSession(account.id)).toThrow();
    storeMethod(store, 'enable', account.id);
    expect(store.byName(account.username)?.disabledAt).toBeNull();
    const restored = store.createSession(account.id);
    expect(store.session(restored.token)).toMatchObject({ userId: account.id });
    storeMethod(store, 'clearAvatar', account.id);
    expect(store.profile(account.id)).toMatchObject({ avatarUrl: null, profileVersion: expect.any(Number) });
  });

  it('keeps invite created/revoked state distinct and enforces the 5-minute to 30-day expiry bounds', () => {
    const now = { value: 30_000 };
    const store = new AccountStore(':memory:', () => now.value); stores.push(store);
    expect(() => store.invite('register', undefined, 299_999)).toThrow();
    expect(() => store.invite('register', undefined, 30 * 86_400_000 + 1)).toThrow();
    const invite = store.invite('register', undefined, 300_000) as { id: string; token: string; expiresAt: number };
    expect(Number(store.db.prepare('SELECT created_at FROM invitations WHERE id=?').get(invite.id)!.created_at)).toBe(now.value);
    expect(invite.expiresAt).toBe(now.value + 300_000);
    store.revokeInvite(invite.id);
    const revoked = store.db.prepare('SELECT id,created_at,revoked_at FROM invitations WHERE id=?').get(invite.id) as { id: string; created_at: number; revoked_at: number | null };
    expect(revoked).toMatchObject({ id: invite.id, created_at: now.value, revoked_at: now.value });
    expect(store.validInvite(invite.token, 'register')).toBeNull();
    now.value += 1;
    const active = store.invite('register', undefined, 86_400_000) as { id: string; token: string; expiresAt: number };
    now.value = active.expiresAt;
    expect(store.validInvite(active.token, 'register')).toBeNull();
    expect(store.db.prepare('SELECT id,revoked_at FROM invitations WHERE id=?').get(active.id)).toMatchObject({ id: active.id, revoked_at: null });
  });

  it('makes username rename unique and leaves the account/session identity stable', () => {
    const store = new AccountStore(':memory:', () => 40_000); stores.push(store);
    const first = store.register('rename_first', 'hash:first', store.invite().token);
    const second = store.register('rename_second', 'hash:second', store.invite().token);
    const session = store.createSession(first.id);
    storeMethod(store, 'rename', first.id, 'renamed_first');
    expect(store.byName('rename_first')).toBeNull();
    expect(store.byName('RENAMED_FIRST')).toMatchObject({ id: first.id });
    expect(store.session(session.token)).toMatchObject({ userId: first.id });
    expect(() => storeMethod(store, 'rename', second.id, 'renamed_first')).toThrow();
  });
});
