import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import { createServer, type Server } from 'node:http';
import { io as ioClient } from 'socket.io-client';
import { AccountStore } from '../server/v2/account-store.ts';
import { createV2App } from '../server/v2/app.ts';
import { createFakeClock, type FakeClock } from '../server/clock.ts';
import { createLogStore, type LogStore } from '../server/log-store.ts';

type User = { username: string; cookie: string; userId: string };
type Harness = { app: ReturnType<typeof createV2App>; clock: FakeClock; users: User[]; server: Server; base: string };
const harnesses: Harness[] = [];

afterEach(async () => {
  for (const h of harnesses.splice(0)) {
    h.app.close();
    await new Promise<void>((resolve) => h.server.close(() => resolve()));
  }
});

async function makeHarness(count = 14): Promise<Harness> {
  const accounts = new AccountStore(':memory:');
  const clock = createFakeClock(1_000);
  const logStore: LogStore = createLogStore(':memory:');
  const users: User[] = [];
  for (let index = 1; index <= count; index += 1) {
    const username = `v2_user_${index}`;
    const account = accounts.register(username, 'dummy-hash', accounts.invite().token);
    const session = accounts.createSession(account.id);
    users.push({ username, userId: account.id, cookie: `td_account_v2=${session.token}` });
  }
  const app = createV2App({ accounts, clock, logStore, origin: 'http://allowed.test' });
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

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function post(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

async function createRoom(h: Harness, user = h.users[0]!): Promise<{ roomCode: string; gameId: string; playerId: string }> {
  const response = await request(h, '/api/v2/rooms', post({ nickname: user.username }), user);
  expect(response.status).toBe(201);
  return (await json(response)) as { roomCode: string; gameId: string; playerId: string };
}

async function fillAndStart(h: Harness) {
  const room = await createRoom(h);
  for (const user of h.users.slice(1, 13)) {
    const joined = await request(h, `/api/v2/rooms/${room.roomCode}/join`, post({ nickname: user.username }), user);
    expect(joined.status).toBe(201);
  }
  for (const user of h.users.slice(0, 13)) {
    const ready = await request(h, `/api/v2/rooms/${room.roomCode}/ready`, post({ ready: true }), user);
    expect(ready.status).toBe(200);
  }
  const started = await request(h, `/api/v2/rooms/${room.roomCode}/start`, post({}), h.users[0]);
  expect(started.status).toBe(200);
  return room;
}

describe('v2 HTTP core', () => {
  it('keeps old API unreachable, requires login, and supports create/join with duplicate-seat rejection', async () => {
    const h = await makeHarness();
    expect((await request(h, '/api/rooms')).status).toBe(404);
    expect((await request(h, '/api/v2/rooms', post({ nickname: '匿名' }))).status).toBe(401);
    const room = await createRoom(h);
    const duplicate = await request(h, `/api/v2/rooms/${room.roomCode}/join`, post({ nickname: '重复' }), h.users[0]);
    expect(duplicate.status).toBe(409);
    expect((await json(duplicate)).error).toMatchObject({ code: 'already_joined' });
    const joined = await request(h, `/api/v2/rooms/${room.roomCode}/join`, post({ nickname: '玩家2' }), h.users[1]);
    expect(joined.status).toBe(201);
  });

  it('login session 2 does not take over until explicit takeover', async () => {
    const h = await makeHarness();
    const room = await createRoom(h);
    const accountId = h.users[0]!.userId;
    const second = h.app.access.get(room.gameId)!.accounts.createSession(accountId);
    const session2: User = { ...h.users[0]!, cookie: `td_account_v2=${second.token}` };
    expect((await request(h, `/api/v2/rooms/${room.roomCode}/view`, {}, session2)).status).toBe(403);
    const takeover = await request(h, `/api/v2/rooms/${room.roomCode}/takeover`, post({}), session2);
    expect(takeover.status).toBe(200);
    expect((await request(h, `/api/v2/rooms/${room.roomCode}/view`, {}, h.users[0])).status).toBe(403);
    const oldCommand = await request(h, `/api/v2/rooms/${room.roomCode}/command`, post({ requestId: 'old', action: 'END_SPEECH', windowInstanceId: 'none' }), h.users[0]);
    expect(oldCommand.status).toBe(403);
  });

  it('leave retains the player seat and the account can explicitly take it over again', async () => {
    const h = await makeHarness();
    const room = await fillAndStart(h);
    const left = await request(h, `/api/v2/rooms/${room.roomCode}/leave`, post({}), h.users[0]);
    expect(left.status).toBe(200);
    expect(await json(left)).toMatchObject({ left: true, seatRetained: true });
    const second = h.app.access.get(room.gameId)!.accounts.createSession(h.users[0]!.userId);
    const session2: User = { ...h.users[0]!, cookie: `td_account_v2=${second.token}` };
    expect((await request(h, `/api/v2/rooms/${room.roomCode}/takeover`, post({}), session2)).status).toBe(200);
  });

  it('uses real role windows, keeps request ids per player, and rejects a genuinely late command', async () => {
    const h = await makeHarness();
    const room = await fillAndStart(h);
    const meta = h.app.access.get(room.gameId)!;
    const doorId = meta.room.state!.players.find((player) => player.roleId === 'door')!.playerId;
    const deathId = meta.room.state!.players.find((player) => player.roleId === 'death')!.playerId;
    const door = h.users.find((user) => user.userId === meta.seats.get(doorId)!.userId)!;
    const death = h.users.find((user) => user.userId === meta.seats.get(deathId)!.userId)!;
    const guardWindow = meta.room.driver!.windows().find((window) => window.id === 'guard')!;
    const factionWindow = meta.room.driver!.windows().find((window) => window.id === 'faction')!;
    const guardTarget = meta.room.state!.players.find((player) => player.playerId !== doorId && player.life !== 'dead')!.playerId;
    const guardResponse = await request(h, `/api/v2/rooms/${room.roomCode}/command`, post({ requestId: 'same-request', action: 'SUBMIT_GUARD', windowInstanceId: guardWindow.instanceId, targets: [guardTarget] }), door);
    const proposalResponse = await request(h, `/api/v2/rooms/${room.roomCode}/command`, post({ requestId: 'same-request', action: 'EDIT_PROPOSAL', windowInstanceId: factionWindow.instanceId, targets: [guardTarget] }), death);
    const guardResult = await json(guardResponse);
    const proposalResult = await json(proposalResponse);
    expect(guardResult).toMatchObject({ requestId: 'same-request', status: 'accepted' });
    expect(proposalResult).toMatchObject({ requestId: 'same-request', status: 'accepted' });
    expect(meta.room.driver!.proposalState(deathId)?.revision).toBeGreaterThan(0);

    h.clock.elapse(Math.max(0, guardWindow.closesAt - h.clock.now()) + 1);
    const late = await request(h, `/api/v2/rooms/${room.roomCode}/command`, post({ requestId: 'late', action: 'SUBMIT_GUARD', windowInstanceId: guardWindow.instanceId, targets: [guardTarget] }), door);
    expect(await json(late)).toMatchObject({ requestId: 'late', status: 'rejected', code: 'window_closed' });
  });

  it('disconnects the old realtime session after HTTP takeover', async () => {
    const h = await makeHarness();
    const room = await createRoom(h);
    const meta = h.app.access.get(room.gameId)!;
    const socket = ioClient(h.base, { path: '/api/v2/socket.io', auth: { gameId: room.gameId }, extraHeaders: { cookie: h.users[0]!.cookie }, reconnection: false });
    let frames = 0;
    socket.on('view_updated', () => { frames += 1; });
    await new Promise<void>((resolve, reject) => { socket.once('connect', () => resolve()); socket.once('connect_error', reject); });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const before = frames;
    const session2 = meta.accounts.createSession(h.users[0]!.userId);
    const second: User = { ...h.users[0]!, cookie: `td_account_v2=${session2.token}` };
    const disconnected = new Promise<void>((resolve) => socket.once('disconnect', () => resolve()));
    const takeover = await request(h, `/api/v2/rooms/${room.roomCode}/takeover`, post({}), second);
    expect(takeover.status).toBe(200);
    await disconnected;
    h.app.hub.broadcaster.emitGameEvents(room.gameId, [], meta.room.state!);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(frames).toBe(before);
    socket.disconnect();
  });
});
