import { Router, type Request, type Response } from 'express';
import { AccountStore, type AccountSession } from './account-store.ts';
import { ApiError } from './errors.ts';
import { hashPassword, validatePassword, verifyPassword } from './passwords.ts';
import { RateLimits } from './rate-limit.ts';

export const COOKIE = 'td_account_v2';
export function accountSession(store: AccountStore, cookie: string): AccountSession | null {
  const raw = cookie.split(';').map((p) => p.trim()).find((p) => p.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  return raw ? store.session(raw) : null;
}
export function requireAccount(store: AccountStore, req: Request): AccountSession {
  const session = accountSession(store, req.headers.cookie ?? '');
  if (!session) throw new ApiError(401, 'unauthorized');
  return session;
}
export function textField(value: unknown, name: string, min = 1, max = 128): string {
  if (typeof value !== 'string' || value.length < min || value.length > max) throw new ApiError(400, `invalid_${name}`);
  return value;
}
export function authRouter(store: AccountStore, secure: boolean, onRevoked: (userId: string) => void) {
  const router = Router();
  const limits = new RateLimits(store.now);
  const cookieOptions = { httpOnly: true, secure, sameSite: 'strict' as const, path: '/api/v2', maxAge: 7 * 86400_000 };
  const loginResponse = (res: Response, userId: string) => {
    const { token, session } = store.createSession(userId);
    res.cookie(COOKIE, token, cookieOptions).json({ userId, expiresAt: session.expiresAt });
  };
  router.post('/register', async (req, res) => {
    if (!limits.allow(`register:${req.ip}`, 10, 60_000)) throw new ApiError(429, 'rate_limited');
    const username = textField(req.body?.username, 'username', 3, 32).toLowerCase();
    const invitation = textField(req.body?.invitation, 'invitation');
    const password = req.body?.password; validatePassword(password);
    if (!store.validInvite(invitation, 'register')) throw new ApiError(403, 'invalid_invitation');
    const account = store.register(username, await hashPassword(password), invitation);
    res.status(201); loginResponse(res, account.id);
  });
  router.post('/login', async (req, res) => {
    const username = textField(req.body?.username, 'username', 3, 32).toLowerCase();
    const password = textField(req.body?.password, 'password', 1, 128);
    if (!limits.allow(`login-ip:${req.ip}`, 30, 60_000) || !limits.allow(`login-user:${username}`, 10, 60_000)) throw new ApiError(429, 'rate_limited');
    const account = store.byName(username);
    if (!await verifyPassword(password, account?.passwordHash ?? null) || !account) throw new ApiError(401, 'invalid_credentials');
    loginResponse(res, account.id);
  });
  router.get('/me', (req, res) => {
    const session = requireAccount(store, req);
    res.json({ userId: session.userId, expiresAt: session.expiresAt });
  });
  router.post('/logout', (req, res) => {
    const session = requireAccount(store, req);
    store.logout(session.id); onRevoked(session.userId);
    res.clearCookie(COOKIE, { ...cookieOptions, maxAge: undefined }).json({ loggedOut: true });
  });
  router.post('/reset-password', async (req, res) => {
    if (!limits.allow(`reset:${req.ip}`, 10, 60_000)) throw new ApiError(429, 'rate_limited');
    const reset = textField(req.body?.token, 'token');
    const password = req.body?.password; validatePassword(password);
    if (!store.validInvite(reset, 'reset')) throw new ApiError(403, 'invalid_reset_token');
    const userId = store.resetPassword(reset, await hashPassword(password)); onRevoked(userId);
    res.json({ reset: true });
  });
  router.post('/change-password', async (req, res) => {
    const session = requireAccount(store, req);
    if (!limits.allow(`password:${session.userId}`, 5, 60_000)) throw new ApiError(429, 'rate_limited');
    const oldPassword = textField(req.body?.currentPassword, 'current_password');
    const password = req.body?.password; validatePassword(password);
    const row = store.db.prepare('SELECT password_hash FROM accounts WHERE id=?').get(session.userId);
    if (!row || !await verifyPassword(oldPassword, String(row.password_hash))) throw new ApiError(401, 'invalid_credentials');
    const hash = await hashPassword(password);
    // An async password calculation must not revive a concurrently revoked session.
    requireAccount(store, req);
    store.changePassword(session.userId, hash); onRevoked(session.userId);
    res.clearCookie(COOKIE, { ...cookieOptions, maxAge: undefined }).json({ changed: true });
  });
  return router;
}
