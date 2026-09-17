import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
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

async function createRoom(h: Harness) {
  const response = await request(h, '/api/v2/rooms', post({ nickname: h.users[0]!.username }), h.users[0]);
  expect(response.status).toBe(201);
  return (await json(response)) as { roomCode: string; gameId: string };
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
});
