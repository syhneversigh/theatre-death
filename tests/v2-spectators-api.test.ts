import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { io as ioClient } from 'socket.io-client';
import { AccountStore } from '../server/v2/account-store.ts';
import { createV2App } from '../server/v2/app.ts';
import { createFakeClock, type FakeClock } from '../server/clock.ts';
import { createLogStore } from '../server/log-store.ts';

type User = { username: string; cookie: string; userId: string };
type Harness = { app: ReturnType<typeof createV2App>; clock: FakeClock; users: User[]; server: Server; base: string };
const harnesses: Harness[] = [];

afterEach(async () => {
  for (const h of harnesses.splice(0)) {
    h.app.close();
    await new Promise<void>((resolve) => h.server.close(() => resolve()));
  }
});

async function makeHarness(): Promise<Harness> {
  const accounts = new AccountStore(':memory:');
  const clock = createFakeClock(1_000);
  const users: User[] = [];
  for (let index = 1; index <= 14; index += 1) {
    const username = `spectator_user_${index}`;
    const account = accounts.register(username, 'dummy-hash', accounts.invite().token);
    const session = accounts.createSession(account.id);
    users.push({ username: `sp${index}`, userId: account.id, cookie: `td_account_v2=${session.token}` });
  }
  const app = createV2App({ accounts, clock, logStore: createLogStore(':memory:'), origin: 'http://allowed.test' });
  const server = createServer(app.app);
  app.hub.attachV2(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const h = { app, clock, users, server, base: `http://127.0.0.1:${address.port}` };
  harnesses.push(h);
  return h;
}

async function request(h: Harness, path: string, init: RequestInit = {}, user?: User): Promise<Response> {
  const headers = new Headers(init.headers);
  if (user) headers.set('cookie', user.cookie);
  return fetch(`${h.base}${path}`, { ...init, headers });
}
function post(body: unknown): RequestInit { return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }; }
async function json(response: Response): Promise<Record<string, unknown>> { return (await response.json()) as Record<string, unknown>; }

async function createRoom(h: Harness, user = h.users[0]!) {
  const response = await request(h, '/api/v2/rooms', post({ nickname: user.username }), user);
  expect(response.status).toBe(201);
  return (await json(response)) as { roomCode: string; gameId: string; playerId: string };
}

async function startFullRoom(h: Harness) {
  const room = await createRoom(h);
  for (const user of h.users.slice(1, 13)) {
    expect((await request(h, `/api/v2/rooms/${room.roomCode}/join`, post({ nickname: user.username }), user)).status).toBe(201);
  }
  for (const user of h.users.slice(0, 13)) {
    expect((await request(h, `/api/v2/rooms/${room.roomCode}/ready`, post({ ready: true }), user)).status).toBe(200);
  }
  expect((await request(h, `/api/v2/rooms/${room.roomCode}/start`, post({}), h.users[0])).status).toBe(200);
  return room;
}

describe('v2 public spectator HTTP API', () => {
  it('rejects seated players and bind attempts; public spectator has null subject and no write capabilities', async () => {
    const h = await makeHarness();
    const room = await createRoom(h);
    const playerAttempt = await request(h, `/api/v2/rooms/${room.roomCode}/watch`, post({}), h.users[0]);
    expect(playerAttempt.status).toBe(403);
    const bindAttempt = await request(h, `/api/v2/rooms/${room.roomCode}/watch`, post({ bindPlayerId: 'p_fake' }), h.users[13]);
    expect(bindAttempt.status).toBe(400);
    const watched = await request(h, `/api/v2/rooms/${room.roomCode}/watch`, post({}), h.users[13]);
    expect(watched.status).toBe(201);
    const view = await request(h, `/api/v2/rooms/${room.roomCode}/view`, {}, h.users[13]);
    expect(view.status).toBe(200);
    const snapshot = await json(view);
    expect(snapshot.private).toBeNull();
    expect(snapshot.capabilities).toBeUndefined();
  });

  it('after start, public spectator sees no personal log or faction chat and all writes are rejected', async () => {
    const h = await makeHarness();
    const room = await startFullRoom(h);
    const meta = h.app.access.get(room.gameId)!;
    meta.room.chat.push({ id: 1, channel: 'faction', senderId: 'p_secret', text: 'secret', at: h.clock.now(), eventSeq: 1 });
    const watched = await request(h, `/api/v2/rooms/${room.roomCode}/watch`, post({}), h.users[13]);
    expect(watched.status).toBe(201);
    const view = await request(h, `/api/v2/rooms/${room.roomCode}/view`, {}, h.users[13]);
    expect(view.status).toBe(200);
    const snapshot = await json(view);
    expect(snapshot.private).toBeNull();
    expect(snapshot.capabilities).toMatchObject({ allowedCommands: [] });
    expect(snapshot.chat).toMatchObject({ faction: [] });
    for (const [path, body] of [
      [`/api/v2/rooms/${room.roomCode}/command`, { requestId: 'spectator-command', action: 'END_SPEECH', windowInstanceId: 'none' }],
      [`/api/v2/rooms/${room.roomCode}/chat`, { channel: 'public', text: 'write' }],
      [`/api/v2/rooms/${room.roomCode}/ready`, { ready: false }],
    ] as const) {
      expect((await request(h, path, post(body), h.users[13])).status).toBe(403);
    }
  });

  it('unwatch revokes access and host kick removes a spectator', async () => {
    const h = await makeHarness();
    const room = await createRoom(h);
    const watched = await request(h, `/api/v2/rooms/${room.roomCode}/watch`, post({}), h.users[13]);
    await json(watched);
    expect((await request(h, `/api/v2/rooms/${room.roomCode}/unwatch`, post({}), h.users[13])).status).toBe(200);
    expect((await request(h, `/api/v2/rooms/${room.roomCode}/view`, {}, h.users[13])).status).toBe(403);

    const watchedAgain = await request(h, `/api/v2/rooms/${room.roomCode}/watch`, post({}), h.users[13]);
    const spectatorIdAgain = String((await json(watchedAgain)).spectatorId);
    const list = await request(h, `/api/v2/rooms/${room.roomCode}/spectators`, {}, h.users[0]);
    expect(list.status).toBe(200);
    const kickedId = String(((await json(list)).spectators as Array<{ spectatorId: string }>)[0]?.spectatorId);
    expect(kickedId).toBe(spectatorIdAgain);
    const kicked = await request(h, `/api/v2/rooms/${room.roomCode}/kick-spectator`, post({ spectatorId: kickedId }), h.users[0]);
    expect(kicked.status).toBe(200);
    expect((await request(h, `/api/v2/rooms/${room.roomCode}/view`, {}, h.users[13])).status).toBe(403);
  });

  it('authorizes the seated player to issue a second-screen invite and exposes only that subject read-only', async () => {
    const h = await makeHarness();
    const room = await startFullRoom(h);
    const meta = h.app.access.get(room.gameId)!;
    expect((await request(h, `/api/v2/rooms/${room.roomCode}/second-screen/invitations`, post({}), h.users[13])).status).toBe(403);
    const issued = await request(h, `/api/v2/rooms/${room.roomCode}/second-screen/invitations`, post({}), h.users[0]);
    expect(issued.status).toBe(201);
    const token = String((await json(issued)).token);
    const secondSession = meta.accounts.createSession(h.users[0]!.userId);
    const second = { ...h.users[0]!, cookie: `td_account_v2=${secondSession.token}` };
    expect((await request(h, `/api/v2/rooms/${room.roomCode}/second-screen/redeem`, post({ token }), second)).status).toBe(403);
    const redeemed = await request(h, `/api/v2/rooms/${room.roomCode}/second-screen/redeem`, post({ token }), h.users[13]);
    expect(redeemed.status).toBe(201);
    const view = await request(h, `/api/v2/rooms/${room.roomCode}/view`, {}, h.users[13]);
    const snapshot = await json(view);
    expect((snapshot.private as { self: { playerId: string } }).self.playerId).toBe(room.playerId);
    expect(snapshot.capabilities).toMatchObject({ allowedCommands: [] });
    for (const [path, body] of [
      [`/api/v2/rooms/${room.roomCode}/command`, { requestId: 'private-command', action: 'END_SPEECH', windowInstanceId: 'none' }],
      [`/api/v2/rooms/${room.roomCode}/chat`, { channel: 'public', text: 'blocked' }],
    ] as const) expect((await request(h, path, post(body), h.users[13])).status).toBe(403);

    const frames: unknown[] = [];
    const socket = ioClient(h.base, { path: '/api/v2/socket.io', auth: { gameId: room.gameId }, extraHeaders: { cookie: h.users[13]!.cookie }, reconnection: false });
    socket.on('view_updated', (frame) => frames.push(frame));
    await new Promise<void>((resolve, reject) => { socket.once('connect', () => resolve()); socket.once('connect_error', reject); });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((frames[0] as { private: { self: { playerId: string } } }).private.self.playerId).toBe(room.playerId);
    const disconnected = new Promise<void>((resolve) => socket.once('disconnect', () => resolve()));
    expect((await request(h, `/api/v2/rooms/${room.roomCode}/second-screen/revoke`, post({}), h.users[0])).status).toBe(200);
    await disconnected;
    expect((await request(h, `/api/v2/rooms/${room.roomCode}/view`, {}, h.users[13])).status).toBe(403);
    socket.disconnect();
  });

  it('rejects invalid, expired, cross-room, and repeated second-screen redemption', async () => {
    const h = await makeHarness();
    const first = await createRoom(h);
    const issued = await request(h, `/api/v2/rooms/${first.roomCode}/second-screen/invitations`, post({}), h.users[0]);
    const token = String((await json(issued)).token);
    expect((await request(h, `/api/v2/rooms/${first.roomCode}/second-screen/redeem`, post({ token: 'invalid-token' }), h.users[12])).status).toBe(403);
    const second = await createRoom(h, h.users[1]);
    expect((await request(h, `/api/v2/rooms/${second.roomCode}/second-screen/redeem`, post({ token }), h.users[12])).status).toBe(403);
    expect((await request(h, `/api/v2/rooms/${first.roomCode}/second-screen/redeem`, post({ token }), h.users[12])).status).toBe(201);
    expect((await request(h, `/api/v2/rooms/${first.roomCode}/second-screen/redeem`, post({ token }), h.users[11])).status).toBe(403);
    const expires = await request(h, `/api/v2/rooms/${first.roomCode}/second-screen/invitations`, post({}), h.users[0]);
    const expiresToken = String((await json(expires)).token);
    h.clock.advance(300_001);
    expect((await request(h, `/api/v2/rooms/${first.roomCode}/second-screen/redeem`, post({ token: expiresToken }), h.users[11])).status).toBe(403);
  });
});
