import { afterEach, describe, expect, it, vi } from 'vitest';

let releaseVerify: (() => void) | null = null;
let verifyStarted: (() => void) | null = null;
const started = new Promise<void>((resolve) => { verifyStarted = resolve; });

vi.mock('../server/v2/passwords.ts', () => ({
  hashPassword: async (password: string) => `hash:${password}`,
  validatePassword(password: unknown): asserts password is string {
    if (typeof password !== 'string' || password.length < 12) throw new Error('invalid password');
  },
  verifyPassword: async () => {
    verifyStarted?.();
    await new Promise<void>((resolve) => { releaseVerify = resolve; });
    return true;
  },
}));

const { default: express } = await import('express');
const { createServer } = await import('node:http');
const { AccountStore } = await import('../server/v2/account-store.ts');
const { authRouter } = await import('../server/v2/auth.ts');

const stores: InstanceType<typeof AccountStore>[] = [];
const servers: Array<ReturnType<typeof createServer>> = [];
afterEach(async () => {
  releaseVerify?.();
  for (const server of servers.splice(0)) await new Promise<void>((resolve) => server.close(() => resolve()));
  for (const store of stores.splice(0)) store.close();
});

describe('auth verify/reset race', () => {
  it('does not create a session from a password hash invalidated during verify', async () => {
    const store = new AccountStore(':memory:');
    stores.push(store);
    const account = store.register('race_user', 'hash:old password', store.invite().token);
    const reset = store.invite('reset', account.username);
    const app = express();
    app.use(express.json());
    app.use('/auth', authRouter(store, false, () => undefined));
    app.use((error: { status?: number; code?: string }, _req: unknown, res: { status: (n: number) => { json: (v: unknown) => void } }) => res.status(error.status ?? 500).json({ error: error.code }));
    const server = createServer(app);
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    const login = fetch(`http://127.0.0.1:${port}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'race_user', password: 'old password' }) });
    await started;
    store.resetPassword(reset.token, 'hash:new password');
    releaseVerify?.();
    const response = await login;
    expect(response.status).toBe(401);
    expect(store.db.prepare('SELECT COUNT(*) AS count FROM sessions').get()).toMatchObject({ count: 0 });
  }, 10_000);
});
