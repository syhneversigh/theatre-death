import express, { type NextFunction, type Request, type Response } from 'express';
import type { Clock } from '../clock.ts';
import type { LogStore } from '../log-store.ts';
import { RoomRegistry, type Room } from '../rooms.ts';
import { ReceiptStore } from '../receipts.ts';
import type { VoiceService } from '../../voice/livekit.ts';
import { buildReviewView } from '../../visibility/review.ts';
import { THEATER_DEATH_13_V2 } from '../../rulesets/theater-death-13-v2.ts';
import { validateRuleset } from '../../rulesets/validate.ts';
import type { RulesetConfig } from '../../rulesets/types.ts';
import { AccountStore, type AccountSession } from './account-store.ts';
import { RoomAccess } from './access.ts';
import { accountSession, authRouter, requireAccount, textField } from './auth.ts';
import { ApiError } from './errors.ts';
import { chatView, createV2Realtime } from './realtime.ts';
import { gameView } from './view.ts';
import { parseCommand } from './parse-command.ts';
import { RateLimits } from './rate-limit.ts';

export interface V2Deps { accounts: AccountStore; clock: Clock; logStore: LogStore; origin: string; secureCookies?: boolean; voice?: VoiceService | null }
export function createV2App(deps: V2Deps) {
  const { accounts, clock } = deps;
  const access = new Map<string, RoomAccess>();
  const receipts = new Map<string, ReceiptStore>();
  const limits = new RateLimits(() => clock.now());
  const resolve = (cookie: string, gameId: string) => {
    const session = accountSession(accounts, cookie);
    return session ? access.get(gameId)?.resolve(session) ?? null : null;
  };
  const hub = createV2Realtime(resolve, () => clock.now(), deps.origin);
  const registry = new RoomRegistry({ clock, ruleset: THEATER_DEATH_13_V2, logStore: deps.logStore, broadcaster: hub.broadcaster, strictWindows: true });
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));
  app.use((req, _res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (req.headers.origin && req.headers.origin !== deps.origin) return next(new ApiError(403, 'origin_forbidden'));
      if (!req.is('application/json')) return next(new ApiError(415, 'json_required'));
    }
    next();
  });
  const revokeUser = (userId: string) => {
    for (const meta of access.values()) if (meta.ownSeat(userId) || meta.watchers.has(userId)) {
      void meta.room.enqueue(() => { meta.expireSessions(); hub.refresh(meta.room.gameId); });
    }
  };
  app.use('/api/v2/auth', authRouter(accounts, deps.secureCookies ?? false, revokeUser));
  app.get('/healthz', (_req, res) => res.json({ status: 'ok', apiVersion: 2, rulesVersion: '2.0' }));
  app.get('/', (_req, res) => res.json({ service: 'theater-death-v2', api: '/api/v2', ui: 'not-included' }));
  const router = express.Router();
  router.use((req, _res, next) => { try { requireAccount(accounts, req); next(); } catch (error) { next(error); } });
  const session = (req: Request) => requireAccount(accounts, req);
  const limited = (req: Request, category: string, burst: number, period: number) => {
    const s = session(req);
    if (!limits.allow(`${category}:${s.userId}`, burst, period) || !limits.allow(`${category}:ip:${req.ip}`, burst * 5, period)) throw new ApiError(429, 'rate_limited');
    return s;
  };
  const metaFor = (req: Request) => {
    const room = registry.getByCode(String(req.params.code).toUpperCase());
    const meta = room ? access.get(room.gameId) : null;
    if (!meta) throw new ApiError(404, 'room_not_found');
    return meta;
  };
  const mutation = async <T>(req: Request, action: (meta: RoomAccess, s: AccountSession) => T): Promise<T> => {
    const meta = metaFor(req);
    return meta.room.enqueue(() => {
      const s = session(req);
      const result = action(meta, s);
      meta.lastConnectedAt = clock.now();
      hub.refresh(meta.room.gameId);
      return result;
    });
  };
  const player = (meta: RoomAccess, s: AccountSession) => {
    const viewer = meta.resolve(s);
    if (!viewer || viewer.identity.readOnly || !viewer.identity.subjectPlayerId) throw new ApiError(403, 'seat_control_required');
    return viewer.identity.subjectPlayerId;
  };
  const host = (meta: RoomAccess, s: AccountSession) => { if (player(meta, s) !== meta.room.hostPlayerId) throw new ApiError(403, 'not_host'); };
  const view = (req: Request) => {
    const meta = metaFor(req); const s = session(req); const viewer = meta.resolve(s);
    if (!viewer) throw new ApiError(403, 'room_access_required');
    meta.lastConnectedAt = clock.now();
    return { meta, s, viewer };
  };
  router.post('/rooms', (req, res) => {
    const s = limited(req, 'create', 5, 60_000);
    const nickname = textField(req.body?.nickname, 'nickname', 1, 12).trim();
    if (!nickname) throw new ApiError(400, 'invalid_nickname');
    const ruleset: RulesetConfig = req.body?.roles === undefined ? structuredClone(THEATER_DEATH_13_V2) : { ...structuredClone(THEATER_DEATH_13_V2), mode: 'experimental', roles: req.body.roles };
    const validation = validateRuleset(ruleset);
    if (!validation.ok) throw new ApiError(400, 'invalid_ruleset', validation.issues.map((i) => i.code).join(','));
    const created = registry.createRoom(nickname, ruleset);
    const meta = new RoomAccess(created.room, accounts, () => clock.now(), (identity) => { void deps.voice?.removeParticipant(created.room.gameId, identity).catch(() => console.warn('voice_revoke_failed')); });
    meta.bind(created.member.playerId, s); access.set(created.room.gameId, meta); receipts.set(created.room.gameId, new ReceiptStore());
    res.status(201).json({ roomCode: created.room.code, gameId: created.room.gameId, playerId: created.member.playerId });
  });
  router.get('/me/rooms', (req, res) => {
    const s = session(req);
    res.json({ rooms: [...access.values()].filter((a) => a.ownSeat(s.userId) || a.watchers.has(s.userId)).map((a) => ({ gameId: a.room.gameId, roomCode: a.room.code, phase: a.room.state?.phase ?? 'lobby', playerId: a.ownSeat(s.userId), controlling: a.resolve(s) !== null })) });
  });
  router.post('/rooms/:code/join', async (req, res) => {
    limited(req, 'join', 10, 60_000);
    res.status(201).json(await mutation(req, (meta, s) => {
      if (meta.ownSeat(s.userId) || meta.watchers.has(s.userId)) throw new ApiError(409, 'already_joined');
      const nickname = textField(req.body?.nickname, 'nickname', 1, 12).trim();
      if (!nickname) throw new ApiError(400, 'invalid_nickname');
      const joined = registry.joinRoom(meta.room.code, nickname);
      if (!joined.ok) throw new ApiError(joined.status, joined.code);
      meta.bind(joined.member.playerId, s);
      return { gameId: meta.room.gameId, roomCode: meta.room.code, playerId: joined.member.playerId };
    }));
  });
  router.post('/rooms/:code/takeover', async (req, res) => { limited(req, 'takeover', 10, 60_000); res.json(await mutation(req, (meta, s) => ({ playerId: meta.takeover(s) }))); });
  router.post('/rooms/:code/leave', async (req, res) => { res.json(await mutation(req, (meta, s) => { meta.leave(s); return { left: true, seatRetained: meta.ownSeat(s.userId) !== null }; })); });
  router.post('/rooms/:code/ready', async (req, res) => {
    res.json(await mutation(req, (meta, s) => {
      const id = player(meta, s);
      if (meta.room.state) throw new ApiError(409, 'game_started');
      if (typeof req.body?.ready !== 'boolean') throw new ApiError(400, 'invalid_ready');
      meta.room.members.find((m) => m.playerId === id)!.ready = req.body.ready;
      return { ready: req.body.ready };
    }));
  });
  router.post('/rooms/:code/start', async (req, res) => {
    res.json(await mutation(req, (meta, s) => {
      host(meta, s);
      if (meta.room.state) throw new ApiError(409, 'game_started');
      if (meta.room.members.length !== meta.room.requiredPlayerCount()) throw new ApiError(409, 'room_not_full');
      if (meta.room.members.some((m) => !m.ready)) throw new ApiError(409, 'not_ready');
      registry.startGame(meta.room); return { started: true };
    }));
  });
  router.get('/rooms/:code/view', (req, res) => { const { viewer } = view(req); res.json({ ...gameView(viewer.room, viewer.identity, clock.now()), chat: chatView(viewer) }); });
  router.get('/rooms/:code/review', (req, res) => {
    const { viewer } = view(req); const state = viewer.room.state;
    if (!state || !state.win) throw new ApiError(403, 'game_not_ended');
    res.json({ review: buildReviewView({ state, events: viewer.room.events, messages: viewer.room.chat }) });
  });
  router.post('/rooms/:code/command', async (req, res) => {
    limited(req, 'command', 16, 2000);
    const requestId = textField(req.body?.requestId, 'request_id', 1, 80);
    res.json(await mutation(req, (meta, s) => {
      const id = player(meta, s); const command = parseCommand(req.body, id);
      return receipts.get(meta.room.gameId)!.execute(meta.room.gameId, id, requestId, command, () => {
        if (!meta.room.driver || !meta.room.state) return { requestId, status: 'rejected', code: 'game_not_started', message: '对局尚未开始' };
        const result = meta.room.driver.submit(command);
        return { requestId, status: result.accepted ? 'accepted' : 'rejected', code: result.code, message: result.message };
      });
    }));
  });
  router.post('/rooms/:code/chat', async (req, res) => {
    limited(req, 'chat', 5, 2500);
    res.status(201).json(await mutation(req, (meta, s) => {
      const id = player(meta, s); const state = meta.room.state;
      if (!state) throw new ApiError(409, 'game_not_started');
      const snapshot = gameView(meta.room, { subjectPlayerId: id, readOnly: false }, clock.now());
      const channel = req.body?.channel;
      if (channel !== 'public' && channel !== 'faction') throw new ApiError(400, 'invalid_channel');
      if (!(channel === 'public' ? snapshot.capabilities?.canPostPublic : snapshot.capabilities?.canPostFaction)) throw new ApiError(403, 'chat_forbidden');
      const text = textField(req.body?.text, 'text', 1, 500).trim();
      if (!text) throw new ApiError(400, 'invalid_text');
      const message = { id: meta.room.nextMessageId++, channel: channel as 'public' | 'faction', senderId: id, text, at: clock.now(), eventSeq: state.eventSeq };
      meta.room.chat.push(message); registry.logMessage(meta.room, message);
      return { sent: true };
    }));
  });
  router.post('/rooms/:code/kick', async (req, res) => {
    res.json(await mutation(req, (meta, s) => {
      host(meta, s); const id = textField(req.body?.playerId, 'player_id');
      const kicked = registry.kickMember(meta.room, id);
      if (!kicked.ok) throw new ApiError(kicked.status, kicked.code);
      meta.removeSeat(id); return { removed: true };
    }));
  });
  app.use('/api/v2', router);
  app.use((_req, res) => res.status(404).json({ error: { code: 'not_found' } }));
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ApiError) { res.status(error.status).json({ error: { code: error.code, message: error.message } }); return; }
    if (error instanceof SyntaxError) { res.status(400).json({ error: { code: 'invalid_json' } }); return; }
    console.error('v2_request_failed', error instanceof Error ? error.message : 'unknown');
    res.status(500).json({ error: { code: 'internal_error' } });
  });
  return { app, registry, access, hub, router, resolve, revokeUser, close() { hub.close(); for (const meta of access.values()) { meta.room.driver?.dispose(); meta.close(); } } };
}
