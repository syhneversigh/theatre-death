import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import type { AdminAccountSummary, AdminAuditEntry, AdminInvitationStatus, AdminInvitationSummary, AdminPage, AdminSummary } from '../../contracts/admin.ts';
import type { AccountStore } from './account-store.ts';
import type { RoomDirectory } from './room-directory.ts';
import type { RoomGovernance } from './governance.ts';
import type { StableRoom } from './stable-room.ts';
import type { AvatarStore } from './avatars.ts';
import { ApiError } from './errors.ts';
import { RateLimits } from './rate-limit.ts';
import { OperationReceipts } from './operation-receipts.ts';
import { textField } from './auth.ts';

const TWO_HOURS = 2 * 60 * 60_000;
const MIN_INVITE_TTL = 5 * 60_000;
const MAX_INVITE_TTL = 30 * 86400_000;
export const ADMIN_COOKIE = 'td_admin_v2';
const hash = (value: string) => createHash('sha256').update(value).digest();
const cookie = (req: Request, name: string) => req.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith(name + '='))?.slice(name.length + 1) ?? null;

class AdminSessions {
  readonly password: string | null;
  readonly now: () => number;
  readonly sessions = new Map<string, number>();
  readonly cookieName: string;
  constructor(password: string | null, now: () => number, cookieName: string) { this.password = password; this.now = now; this.cookieName = cookieName; }
  login(password: string) {
    if (!this.password) throw new ApiError(404, 'admin_not_configured');
    if (!timingSafeEqual(hash(password), hash(this.password))) throw new ApiError(401, 'invalid_admin_credentials');
    const raw = randomBytes(32).toString('base64url'), expiresAt = this.now() + TWO_HOURS;
    this.sessions.set(hash(raw).toString('hex'), expiresAt); return { raw, expiresAt };
  }
  require(req: Request) {
    if (!this.password) throw new ApiError(404, 'admin_not_configured');
    const raw = cookie(req, this.cookieName), key = raw ? hash(raw).toString('hex') : '';
    const expiresAt = this.sessions.get(key);
    if (!expiresAt || expiresAt <= this.now()) { if (key) this.sessions.delete(key); throw new ApiError(401, 'admin_unauthorized'); }
    return { key, expiresAt };
  }
  logout(req: Request) { const raw = cookie(req, this.cookieName); if (raw) this.sessions.delete(hash(raw).toString('hex')); }
  close() { this.sessions.clear(); }
}

interface AdminDeps {
  accounts: AccountStore; directory: RoomDirectory; governance: RoomGovernance; avatars?: AvatarStore;
  origin: string; secureCookies: boolean; password: string | null; adminCookieName?: string;
  refresh: (room: StableRoom) => void; revokeUser: (userId: string, event?: { reason: 'logout' | 'credentials_changed'; sessionId?: string }) => Promise<void>;
}

const pageInput = (req: Request) => {
  const page = Number(req.query.page ?? 1), pageSize = Number(req.query.pageSize ?? 50);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new ApiError(400, 'invalid_page');
  return { page, pageSize, offset: (page - 1) * pageSize };
};
const ttlInput = (value: unknown, fallback = 7 * 86400_000) => {
  const ttl = value === undefined ? fallback : Number(value) * 1000;
  if (!Number.isSafeInteger(ttl) || ttl < MIN_INVITE_TTL || ttl > MAX_INVITE_TTL) throw new ApiError(400, 'invalid_expiry');
  return ttl;
};

export function createAdminRouter(deps: AdminDeps) {
  const adminCookieName = deps.adminCookieName ?? ADMIN_COOKIE;
  const router = Router(), sessions = new AdminSessions(deps.password, deps.accounts.now, adminCookieName), limits = new RateLimits(deps.accounts.now), receipts = new OperationReceipts();
  const cookieOptions = { httpOnly: true, secure: deps.secureCookies, sameSite: 'strict' as const, path: '/api/v2/admin', maxAge: TWO_HOURS };
  router.post('/auth/login', (req, res) => {
    if (!limits.allow('admin-login:' + req.ip, 5, 15 * 60_000)) throw new ApiError(429, 'rate_limited');
    const result = sessions.login(textField(req.body?.password, 'password', 1, 256));
    deps.accounts.recordAdminAction('login', 'auth', null);
    res.cookie(adminCookieName, result.raw, cookieOptions).json({ authenticated: true, expiresAt: result.expiresAt });
  });
  router.get('/me', (req, res) => { const session = sessions.require(req); res.json({ authenticated: true, expiresAt: session.expiresAt }); });
  router.post('/auth/logout', (req, res) => { sessions.require(req); sessions.logout(req); res.clearCookie(adminCookieName, { ...cookieOptions, maxAge: undefined }).json({ loggedOut: true }); });
  router.use((req, _res, next) => { try { sessions.require(req); next(); } catch (error) { next(error); } });
  router.use((req, res, next) => {
    if (!['POST', 'PATCH'].includes(req.method)) { next(); return; }
    try {
      const requestId = textField(req.body?.requestId, 'request_id', 1, 80);
      const ticket = receipts.reserve('admin', req.path, requestId, req.body);
      if (!ticket.owner) { void ticket.promise.then(response => res.status(response.status).json(response.body)); return; }
      const send = res.json.bind(res);
      res.json = (body: unknown) => { ticket.finish({ status: res.statusCode, body }); return send(body); };
      next();
    } catch (error) { next(error); }
  });

  const roomForUser = (userId: string) => {
    const roomId = deps.directory.current.get(userId), room = roomId ? deps.directory.byId.get(roomId) : undefined;
    if (room && !room.dissolved) return room;
    return [...deps.directory.byId.values()].find(candidate => !candidate.dissolved && candidate.participants.has(userId)) ?? null;
  };
  const accountSummary = (row: Record<string, unknown>): AdminAccountSummary => {
    const userId = String(row.id), room = roomForUser(userId), member = room?.members.get(userId);
    return {
      userId, username: String(row.username), createdAt: Number(row.created_at), disabledAt: row.disabled_at === null ? null : Number(row.disabled_at),
      status: row.disabled_at === null ? 'active' : 'disabled', avatarUrl: row.avatar_id === null ? null : `/api/v2/admin/avatars/${row.avatar_id}`,
      profileVersion: Number(row.profile_version), activeSessionCount: Number(row.active_sessions),
      room: room ? { roomId: room.roomId, roomCode: room.code, phase: room.phase, kind: member?.kind ?? null } : null,
    };
  };
  const invitationSummary = (row: Record<string, unknown>): AdminInvitationSummary => {
    const usedAt = row.used_at === null ? null : Number(row.used_at), revokedAt = row.revoked_at === null ? null : Number(row.revoked_at), expiresAt = Number(row.expires_at);
    const status: AdminInvitationStatus = usedAt !== null ? 'used' : revokedAt !== null ? 'revoked' : expiresAt <= deps.accounts.now() ? 'expired' : 'active';
    return { id: String(row.id), purpose: String(row.purpose) as 'register' | 'reset', targetUserId: row.user_id === null ? null : String(row.user_id), targetUsername: row.username === null ? null : String(row.username), createdAt: row.created_at === null ? null : Number(row.created_at), expiresAt, usedAt, revokedAt, status };
  };
  const invitationRows = () => deps.accounts.db.prepare('SELECT i.id,i.purpose,i.user_id,i.created_at,i.expires_at,i.used_at,i.revoked_at,a.username FROM invitations i LEFT JOIN accounts a ON a.id=i.user_id ORDER BY COALESCE(i.created_at,i.expires_at) DESC,i.id DESC').all() as Record<string, unknown>[];
  const recentActions = (): AdminAuditEntry[] => (deps.accounts.db.prepare('SELECT * FROM admin_actions ORDER BY id DESC LIMIT 50').all() as Record<string, unknown>[]).map(row => ({ id: Number(row.id), action: String(row.action), targetType: String(row.target_type) as AdminAuditEntry['targetType'], targetId: row.target_id === null ? null : String(row.target_id), at: Number(row.at), details: JSON.parse(String(row.details_json)) as AdminAuditEntry['details'] }));

  router.get('/summary', (_req, res) => {
    const totals = deps.accounts.db.prepare('SELECT COUNT(*) total,SUM(CASE WHEN disabled_at IS NOT NULL THEN 1 ELSE 0 END) disabled FROM accounts').get()!;
    const total = Number(totals.total), disabled = Number(totals.disabled ?? 0);
    const invitations = { active: 0, used: 0, revoked: 0, expired: 0 };
    for (const item of invitationRows().map(invitationSummary)) invitations[item.status]++;
    const body: AdminSummary = { accounts: { total, active: total - disabled, disabled, activeSessions: Number(deps.accounts.db.prepare('SELECT COUNT(*) count FROM sessions WHERE expires_at>?').get(deps.accounts.now())!.count) }, invitations, avatars: { total: Number(deps.accounts.db.prepare('SELECT COUNT(*) count FROM avatar_assets').get()!.count), referenced: Number(deps.accounts.db.prepare('SELECT COUNT(*) count FROM accounts WHERE avatar_id IS NOT NULL').get()!.count) }, recentActions: recentActions() };
    res.json(body);
  });
  router.get('/accounts', (req, res) => {
    const { page, pageSize, offset } = pageInput(req), query = String(req.query.query ?? '').trim().toLowerCase(), status = String(req.query.status ?? 'all');
    if (!['all', 'active', 'disabled'].includes(status)) throw new ApiError(400, 'invalid_account_status');
    const clauses: string[] = [], values: string[] = [];
    if (query) { clauses.push("a.username LIKE ? ESCAPE '\\'"); values.push(`%${query.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`); }
    if (status !== 'all') clauses.push(status === 'active' ? 'a.disabled_at IS NULL' : 'a.disabled_at IS NOT NULL');
    const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
    const total = Number(deps.accounts.db.prepare('SELECT COUNT(*) count FROM accounts a' + where).get(...values)!.count);
    const bindings: Array<string | number> = [deps.accounts.now(), ...values, pageSize, offset];
    const rows = deps.accounts.db.prepare(`SELECT a.*,(SELECT COUNT(*) FROM sessions s WHERE s.user_id=a.id AND s.expires_at>?) active_sessions FROM accounts a${where} ORDER BY a.created_at DESC,a.id DESC LIMIT ? OFFSET ?`).all(...bindings) as Record<string, unknown>[];
    const body: AdminPage<AdminAccountSummary> = { items: rows.map(accountSummary), page, pageSize, total }; res.json(body);
  });
  router.get('/invitations', (req, res) => {
    const { page, pageSize, offset } = pageInput(req), purpose = String(req.query.purpose ?? 'all'), status = String(req.query.status ?? 'all');
    if (!['all', 'register', 'reset'].includes(purpose)) throw new ApiError(400, 'invalid_invitation_purpose');
    if (!['all', 'active', 'used', 'revoked', 'expired'].includes(status)) throw new ApiError(400, 'invalid_invitation_status');
    const filtered = invitationRows().map(invitationSummary).filter(item => (purpose === 'all' || item.purpose === purpose) && (status === 'all' || item.status === status));
    const body: AdminPage<AdminInvitationSummary> = { items: filtered.slice(offset, offset + pageSize), page, pageSize, total: filtered.length }; res.json(body);
  });
  router.get('/avatars/:assetId', async (req, res) => {
    if (!deps.avatars) throw new ApiError(409, 'avatars_disabled');
    const bytes = await deps.avatars.read(String(req.params.assetId));
    sessions.require(req);
    res.set('Cache-Control', 'private, max-age=300').set('X-Content-Type-Options', 'nosniff').type('image/webp').send(bytes);
  });

  router.patch('/accounts/:userId', async (req, res) => {
    const userId = textField(req.params.userId, 'user_id'), username = textField(req.body?.username, 'username', 3, 32), room = roomForUser(userId);
    if (room && room.phase !== 'lobby') throw new ApiError(409, 'account_in_active_game');
    const profile = await deps.directory.transaction(async () => room ? room.enqueue(() => { const next = deps.accounts.rename(userId, username); const member = room.members.get(userId); if (member) member.username = next.username; deps.refresh(room); return next; }) : deps.accounts.rename(userId, username));
    deps.accounts.recordAdminAction('rename_account', 'account', userId, { username: profile.username }); res.json(profile);
  });
  router.post('/accounts/:userId/clear-avatar', (req, res) => { const userId = textField(req.params.userId, 'user_id'), profile = deps.accounts.clearAvatar(userId); for (const room of deps.directory.byId.values()) if (room.members.has(userId) || room.participants.has(userId)) deps.refresh(room); deps.accounts.recordAdminAction('clear_avatar', 'account', userId); res.json(profile); });
  router.post('/accounts/:userId/revoke-sessions', async (req, res) => { const userId = textField(req.params.userId, 'user_id'), count = deps.accounts.revokeSessions(userId); await deps.revokeUser(userId); deps.accounts.recordAdminAction('revoke_sessions', 'account', userId, { count }); res.json({ revokedSessions: count }); });
  router.post('/accounts/:userId/disable', async (req, res) => {
    const userId = textField(req.params.userId, 'user_id'), room = roomForUser(userId);
    await deps.directory.transaction(async () => {
      if (room) await room.enqueue(() => { deps.accounts.disable(userId); const member = room.members.get(userId); if (!member) return; if (room.phase === 'lobby') deps.directory.removeMember(room, member, 'account_disabled'); else deps.directory.releaseControl(room, member, 'account_disabled'); deps.refresh(room); });
      else deps.accounts.disable(userId);
    });
    deps.accounts.recordAdminAction('disable_account', 'account', userId); res.json({ disabled: true });
  });
  router.post('/accounts/:userId/enable', (req, res) => { const userId = textField(req.params.userId, 'user_id'); deps.accounts.enable(userId); deps.accounts.recordAdminAction('enable_account', 'account', userId); res.json({ enabled: true }); });
  router.post('/accounts/:userId/reset-token', (req, res) => { const userId = textField(req.params.userId, 'user_id'), row = deps.accounts.db.prepare('SELECT username,disabled_at FROM accounts WHERE id=?').get(userId); if (!row) throw new ApiError(404, 'account_not_found'); if (row.disabled_at !== null) throw new ApiError(409, 'account_disabled'); const result = deps.accounts.invite('reset', String(row.username)); deps.accounts.recordAdminAction('issue_reset_token', 'account', userId, { invitationId: result.id }); res.status(201).json(result); });
  router.post('/invitations', (req, res) => { const ttl = ttlInput(req.body?.ttlSeconds), result = deps.accounts.invite('register', undefined, ttl); deps.accounts.recordAdminAction('create_invitation', 'invitation', result.id, { expiresAt: result.expiresAt }); res.status(201).json(result); });
  router.patch('/invitations/:id', (req, res) => { const id = textField(req.params.id, 'invitation_id'), expiresAt = Number(req.body?.expiresAt), now = deps.accounts.now(); if (!Number.isSafeInteger(expiresAt) || expiresAt <= now + 60_000 || expiresAt > now + MAX_INVITE_TTL) throw new ApiError(400, 'invalid_expiry'); deps.accounts.updateInviteExpiry(id, expiresAt); deps.accounts.recordAdminAction('update_invitation', 'invitation', id, { expiresAt }); res.json({ id, expiresAt }); });
  router.post('/invitations/:id/revoke', (req, res) => { const id = textField(req.params.id, 'invitation_id'); deps.accounts.revokeInvite(id); deps.accounts.recordAdminAction('revoke_invitation', 'invitation', id); res.json({ id, revoked: true }); });
  router.post('/invitations/:id/regenerate', (req, res) => { const id = textField(req.params.id, 'invitation_id'), result = deps.accounts.regenerateInvite(id, ttlInput(req.body?.ttlSeconds)); deps.accounts.recordAdminAction('regenerate_invitation', 'invitation', id, { replacementId: result.id, expiresAt: result.expiresAt }); res.status(201).json(result); });
  return { router, close: () => sessions.close() };
}
