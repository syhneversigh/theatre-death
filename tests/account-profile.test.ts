import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AccountStore } from '../server/v2/account-store.ts';
import { authRouter, COOKIE } from '../server/v2/auth.ts';
import { hashPassword } from '../server/v2/passwords.ts';

const WEEK = 7 * 86400_000;
const directories: string[] = [];
const stores: AccountStore[] = [];
const servers: Server[] = [];

afterEach(async () => {
  for (const server of servers.splice(0).reverse()) await new Promise<void>((resolve) => server.close(() => resolve()));
  for (const store of stores.splice(0).reverse()) store.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function digest(raw: string): string { return createHash('sha256').update(raw).digest('hex'); }

function errorMiddleware() {
  return (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const typed = error as { status?: number; code?: string };
    res.status(typed.status ?? 500).json({ error: typed.code ?? 'internal_error' });
  };
}

async function serve(store: AccountStore, now: { value: number }) {
  const app = express();
  app.use(express.json());
  app.use('/api/v2/auth', authRouter(store, false, () => undefined));
  app.use(errorMiddleware());
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  return {
    app,
    base: `http://127.0.0.1:${port}`,
    now,
    request(path: string, init: RequestInit = {}) {
      return fetch(`http://127.0.0.1:${port}/api/v2/auth${path}`, init);
    },
  };
}

function jsonPost(value: unknown, cookie?: string): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(value),
  };
}

function cookieOf(response: Response): string {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const raw = headers.getSetCookie?.()[0] ?? response.headers.get('set-cookie');
  if (!raw) throw new Error('missing set-cookie');
  return raw.split(';')[0]!;
}

async function body(response: Response): Promise<Record<string, any>> { return await response.json() as Record<string, any>; }

async function seedSchemaOne(path: string, now: number, passwordHash: string) {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY);
    INSERT INTO schema_migrations VALUES (1);
    CREATE TABLE accounts (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE invitations (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, purpose TEXT NOT NULL CHECK(purpose IN ('register','reset')), user_id TEXT REFERENCES accounts(id), expires_at INTEGER NOT NULL, used_at INTEGER);
    CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES accounts(id), expires_at INTEGER NOT NULL);
    CREATE INDEX sessions_user ON sessions(user_id);
  `);
  db.prepare('INSERT INTO accounts VALUES (?,?,?,?)').run('legacy-account', 'legacy_user', passwordHash, now);
  db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(digest('legacy-session-token'), 'legacy-account', now + WEEK);
  db.prepare('INSERT INTO invitations VALUES (?,?,?,?,?,NULL)').run('legacy-register', digest('legacy-register-token'), 'register', null, now + WEEK);
  db.prepare('INSERT INTO invitations VALUES (?,?,?,?,?,NULL)').run('legacy-reset', digest('legacy-reset-token'), 'reset', 'legacy-account', now + 1800_000);
  db.close();
}

describe('account profile and schema migration contract', () => {
  it('migrates a real schema-one file, preserves old rows/session/password, defaults profile fields, reopens, and rejects future schema', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'theater-account-profile-'));
    directories.push(directory);
    const path = join(directory, 'accounts.sqlite');
    const now = { value: 10_000 };
    const passwordHash = await hashPassword('legacy password value');
    await seedSchemaOne(path, now.value, passwordHash);

    const store = new AccountStore(path, () => now.value);
    stores.push(store);
    expect(store.byName('LEGACY_USER')).toMatchObject({ id: 'legacy-account', username: 'legacy_user', passwordHash });
    expect(store.session('legacy-session-token')).toMatchObject({ userId: 'legacy-account', expiresAt: now.value + WEEK });
    expect(store.validInvite('legacy-register-token', 'register')).toMatchObject({ id: 'legacy-register' });
    expect(store.validInvite('legacy-reset-token', 'reset')).toMatchObject({ id: 'legacy-reset', user_id: 'legacy-account' });
    expect(store.profile('legacy-account')).toEqual({ userId: 'legacy-account', username: 'legacy_user', avatarUrl: null, profileVersion: 0 });
    store.close(); stores.splice(stores.indexOf(store), 1);

    const reopened = new AccountStore(path, () => now.value);
    stores.push(reopened);
    expect(reopened.profile('legacy-account').profileVersion).toBe(0);
    reopened.close(); stores.splice(stores.indexOf(reopened), 1);
    const schema = new DatabaseSync(path);
    expect(Number(schema.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()!.version)).toBe(2);
    schema.prepare('INSERT INTO schema_migrations VALUES (3)').run();
    schema.close();
    expect(() => new AccountStore(path, () => now.value)).toThrowError('Unsupported account schema version');
  });

  it('accepts the migrated raw session and old password through HTTP, with flat consistent profile responses', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'theater-account-http-'));
    directories.push(directory);
    const path = join(directory, 'accounts.sqlite');
    const now = { value: 20_000 };
    await seedSchemaOne(path, now.value, await hashPassword('legacy password value'));
    const store = new AccountStore(path, () => now.value);
    stores.push(store);
    const server = await serve(store, now);
    const login = await server.request('/login', jsonPost({ username: 'legacy_user', password: 'legacy password value' }));
    expect(login.status).toBe(200);
    const loginBody = await body(login);
    expect(loginBody).toMatchObject({ userId: 'legacy-account', username: 'legacy_user', avatarUrl: null, profileVersion: 0 });
    const cookie = cookieOf(login);
    const me = await server.request('/me', { headers: { cookie } });
    expect(me.status).toBe(200);
    const meBody = await body(me);
    expect(meBody).toMatchObject({ userId: 'legacy-account', username: 'legacy_user', avatarUrl: null, profileVersion: 0 });
    expect(meBody.expiresAt).toBe(loginBody.expiresAt);

    const rawSession = await server.request('/me', { headers: { cookie: `${COOKIE}=legacy-session-token` } });
    expect(rawSession.status).toBe(200);
    expect((await body(rawSession)).userId).toBe('legacy-account');
  });

  it('returns the same flat profile from register, login, and me', async () => {
    const now = { value: 30_000 };
    const store = new AccountStore(':memory:', () => now.value);
    stores.push(store);
    const server = await serve(store, now);
    const invitation = store.invite();
    const registered = await server.request('/register', jsonPost({ username: 'Profile_User', password: 'profile password value', invitation: invitation.token }));
    expect(registered.status).toBe(201);
    const registeredBody = await body(registered);
    expect(registeredBody).toMatchObject({ username: 'profile_user', avatarUrl: null, profileVersion: 0 });
    const login = await server.request('/login', jsonPost({ username: 'profile_user', password: 'profile password value' }));
    expect(login.status).toBe(200);
    const loginBody = await body(login);
    expect(loginBody).toMatchObject({ userId: registeredBody.userId, username: 'profile_user', avatarUrl: null, profileVersion: 0 });
    const me = await server.request('/me', { headers: { cookie: cookieOf(login) } });
    expect(await body(me)).toMatchObject({ userId: registeredBody.userId, username: 'profile_user', avatarUrl: null, profileVersion: 0 });
  }, 30_000);

  it('checks register invitations without consuming them, rejects reset tokens, and rechecks revoked or consumed tokens', async () => {
    const now = { value: 40_000 };
    const store = new AccountStore(':memory:', () => now.value);
    stores.push(store);
    const server = await serve(store, now);
    const invitation = store.invite();
    expect((await server.request('/invitations/check', jsonPost({ invitation: invitation.token }))).status).toBe(200);
    expect((await server.request('/invitations/check', jsonPost({ invitation: invitation.token }))).status).toBe(200);
    expect(store.validInvite(invitation.token, 'register')).not.toBeNull();
    store.revokeInvite(invitation.id);
    const revoked = await server.request('/register', jsonPost({ username: 'revoked_user', password: 'valid password value', invitation: invitation.token }));
    expect(revoked.status).toBe(403);
    const consumedInvite = store.invite();
    expect((await server.request('/invitations/check', jsonPost({ invitation: consumedInvite.token }))).status).toBe(200);
    store.register('consumed_user', await hashPassword('valid password value'), consumedInvite.token);
    const consumed = await server.request('/register', jsonPost({ username: 'consumed_again', password: 'valid password value', invitation: consumedInvite.token }));
    expect(consumed.status).toBe(403);
    const reset = store.invite('reset', 'consumed_user');
    expect((await server.request('/invitations/check', jsonPost({ invitation: reset.token }))).status).toBe(403);
    const resetRegister = await server.request('/register', jsonPost({ username: 'reset_register', password: 'valid password value', invitation: reset.token }));
    expect(resetRegister.status).toBe(403);
  }, 30_000);

  it('enforces expiry at the boundary and leaves an invalid-username invitation unused', async () => {
    const now = { value: 50_000 };
    const store = new AccountStore(':memory:', () => now.value);
    stores.push(store);
    const server = await serve(store, now);
    const expiring = store.invite('register', undefined, 100);
    now.value = expiring.expiresAt;
    expect((await server.request('/invitations/check', jsonPost({ invitation: expiring.token }))).status).toBe(403);
    const usable = store.invite();
    const invalid = await server.request('/register', jsonPost({ username: 'bad-name', password: 'valid password value', invitation: usable.token }));
    expect(invalid.status).toBe(400);
    expect((await body(invalid)).error).toBe('invalid_username');
    expect(store.validInvite(usable.token, 'register')).not.toBeNull();
    const valid = await server.request('/register', jsonPost({ username: 'good_name', password: 'valid password value', invitation: usable.token }));
    expect(valid.status).toBe(201);
  }, 30_000);

  it('rate limits invitation preflight at thirty requests per minute without consuming the token', async () => {
    const now = { value: 60_000 };
    const store = new AccountStore(':memory:', () => now.value);
    stores.push(store);
    const server = await serve(store, now);
    const invitation = store.invite();
    const responses: Response[] = [];
    for (let index = 0; index < 31; index += 1) responses.push(await server.request('/invitations/check', jsonPost({ invitation: invitation.token })));
    expect(responses.slice(0, 30).every((response) => response.status === 200)).toBe(true);
    expect(responses[30]?.status).toBe(429);
    expect((await body(responses[30]!)).error).toBe('rate_limited');
    expect(store.validInvite(invitation.token, 'register')).not.toBeNull();
  });
});
