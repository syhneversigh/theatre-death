import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import { AccountStore } from '../server/v2/account-store.ts';
import { authRouter, COOKIE } from '../server/v2/auth.ts';
import { hashPassword } from '../server/v2/passwords.ts';

const stores: AccountStore[] = [];
afterEach(() => { for (const store of stores.splice(0)) store.close(); });

function appFor(store: AccountStore, revoked: string[]) {
  const app = express();
  app.use(express.json());
  app.use('/api/v2/auth', authRouter(store, false, (userId) => revoked.push(userId)));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const typed = error as { status?: number; code?: string };
    res.status(typed.status ?? 500).json({ error: typed.code ?? 'internal_error' });
  });
  return app;
}

async function request(app: express.Express, path: string, init: RequestInit = {}) {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address() as { port: number };
  try {
    return await fetch(`http://127.0.0.1:${address.port}/api/v2/auth${path}`, init);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function json(body: unknown, cookie?: string): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie === undefined ? {} : { cookie }) },
    body: JSON.stringify(body),
  };
}

function setCookie(response: Response): string {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const value = headers.getSetCookie?.()[0] ?? response.headers.get('set-cookie');
  if (!value) throw new Error('missing set-cookie');
  return value.split(';')[0] ?? '';
}

async function body(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe('v2 account authentication routes', () => {
  it('registers by invitation, sets a strict HttpOnly scoped cookie, reads me, and logs out', async () => {
    const store = new AccountStore(':memory:');
    stores.push(store);
    const revoked: string[] = [];
    const app = appFor(store, revoked);
    const invitation = store.invite();
    const registered = await request(app, '/register', json({ username: 'New_User', password: 'a sufficiently long password', invitation: invitation.token }));
    expect(registered.status).toBe(201);
    const rawCookie = (registered.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.()[0] ?? '';
    expect(rawCookie).toContain(`${COOKIE}=`);
    expect(rawCookie.toLowerCase()).toContain('httponly');
    expect(rawCookie.toLowerCase()).toContain('samesite=strict');
    expect(rawCookie).toContain('Path=/api/v2');
    expect(rawCookie).toContain('Max-Age=604800');
    const cookie = setCookie(registered);

    const me = await request(app, '/me', { headers: { cookie } });
    expect(me.status).toBe(200);
    expect((await body(me)).userId).toBeDefined();
    const loggedOut = await request(app, '/logout', json({}, cookie));
    expect(loggedOut.status).toBe(200);
    expect(revoked).toHaveLength(1);
    expect((await request(app, '/me', { headers: { cookie } })).status).toBe(401);
  }, 20_000);

  it('returns the same 401 code for a wrong password and an unknown user', async () => {
    const store = new AccountStore(':memory:');
    stores.push(store);
    const account = store.register('known_user', await hashPassword('known password value'), store.invite().token);
    expect(account.username).toBe('known_user');
    const app = appFor(store, []);
    const wrong = await request(app, '/login', json({ username: 'known_user', password: 'wrong password value' }));
    const unknown = await request(app, '/login', json({ username: 'unknown_user', password: 'wrong password value' }));
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await body(wrong)).toEqual({ error: 'invalid_credentials' });
    expect(await body(unknown)).toEqual({ error: 'invalid_credentials' });
  }, 20_000);

  it('reset-password invalidates every existing session and calls revocation hook', async () => {
    const store = new AccountStore(':memory:');
    stores.push(store);
    const account = store.register('reset_user', await hashPassword('old password value'), store.invite().token);
    const first = store.createSession(account.id);
    const second = store.createSession(account.id);
    const reset = store.invite('reset', account.username);
    const revoked: string[] = [];
    const app = appFor(store, revoked);
    expect((await request(app, '/me', { headers: { cookie: `${COOKIE}=${first.token}` } })).status).toBe(200);
    const response = await request(app, '/reset-password', json({ token: reset.token, password: 'new password value' }));
    expect(response.status).toBe(200);
    expect(revoked).toEqual([account.id]);
    expect(store.session(first.token)).toBeNull();
    expect(store.session(second.token)).toBeNull();
  }, 20_000);

  it('rate limits repeated login attempts', async () => {
    const store = new AccountStore(':memory:');
    stores.push(store);
    const app = appFor(store, []);
    const responses: Response[] = [];
    for (let index = 0; index < 11; index += 1) {
      responses.push(await request(app, '/login', json({ username: 'limited_user', password: 'wrong password value' })));
    }
    expect(responses.slice(0, 10).every((response) => response.status === 401)).toBe(true);
    expect(responses[10]?.status).toBe(429);
    expect(await body(responses[10]!)).toEqual({ error: 'rate_limited' });
  }, 30_000);
});
