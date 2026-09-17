import { describe, expect, it } from 'vitest';
import { makeEvent } from '../engine/events.ts';
import { scenario } from './helpers.ts';
import { createFakeClock } from '../server/clock.ts';
import { createLogStore } from '../server/log-store.ts';
import { RoomRegistry } from '../server/rooms.ts';
import { THEATER_DEATH_13_V2 } from '../rulesets/theater-death-13-v2.ts';
import { AccountStore } from '../server/v2/account-store.ts';
import { RoomAccess } from '../server/v2/access.ts';
import { createMaintenance } from '../server/v2/maintenance.ts';

function fixture(connected: () => boolean = () => false) {
  const clock = createFakeClock(0);
  const accounts = new AccountStore(':memory:', () => clock.now());
  const logs = createLogStore(':memory:');
  const registry = new RoomRegistry({ clock, ruleset: THEATER_DEATH_13_V2, logStore: logs });
  const created = registry.createRoom('维护房主');
  const access = new Map<string, RoomAccess>();
  const revoked: string[] = [];
  const meta = new RoomAccess(created.room, accounts, () => clock.now(), (identity) => revoked.push(identity));
  access.set(created.room.gameId, meta);
  const refreshes: string[] = [];
  const removed: string[] = [];
  const maintenance = createMaintenance({
    accounts,
    access,
    registry,
    now: () => clock.now(),
    connected,
    refresh: (gameId) => refreshes.push(gameId),
    removed: (gameId) => removed.push(gameId),
  });
  return { clock, accounts, logs, registry, created, access, meta, maintenance, revoked, refreshes, removed };
}

function close(f: ReturnType<typeof fixture>) {
  f.maintenance.stop();
  f.meta.close();
  f.accounts.close();
  f.logs.close();
}

describe('v2 maintenance lifecycle', () => {
  it('无连接大厅闲置 2h 回收，audit room/event 记录保留', async () => {
    const f = fixture();
    try {
      const event = makeEvent({ seq: 1, dayNumber: 1, stage: 1, type: 'game_started', payload: {}, visibility: { kind: 'public' } });
      f.logs.appendEvents(f.created.room.gameId, [event]);
      f.clock.advance(2 * 3600_000);
      await f.maintenance.sweep();

      expect(f.access.has(f.created.room.gameId)).toBe(false);
      expect(f.registry.getByGameId(f.created.room.gameId)).toBeNull();
      expect(f.removed).toEqual([f.created.room.gameId]);
      expect(f.logs.getRoom(f.created.room.gameId)?.gameId).toBe(f.created.room.gameId);
      expect(f.logs.listEvents(f.created.room.gameId, 0)).toHaveLength(1);
    } finally { close(f); }
  });

  it('活跃连接刷新 lastConnectedAt，进行中对局永不因空闲策略回收', async () => {
    const f = fixture(() => true);
    try {
      f.clock.advance(10 * 3600_000);
      await f.maintenance.sweep();
      expect(f.access.has(f.created.room.gameId)).toBe(true);
      expect(f.registry.getByGameId(f.created.room.gameId)).not.toBeNull();
      expect(f.meta.endedAt).toBeNull();
    } finally { close(f); }
  });

  it('终局达到 24h 回收，之前不会回收且 audit 仍保留', async () => {
    const f = fixture();
    try {
      f.created.room.state = { ...scenario(), phase: 'ended', win: { winner: 'human', dayNumber: 2, reason: 'test' } };
      await f.maintenance.sweep();
      expect(f.access.has(f.created.room.gameId)).toBe(true);
      f.clock.advance(24 * 3600_000 - 1);
      await f.maintenance.sweep();
      expect(f.access.has(f.created.room.gameId)).toBe(true);
      f.clock.advance(1);
      await f.maintenance.sweep();
      expect(f.access.has(f.created.room.gameId)).toBe(false);
      expect(f.logs.getRoom(f.created.room.gameId)).not.toBeNull();
    } finally { close(f); }
  });

  it('维护 sweep 清理注销/过期租约与第二屏，并撤销其媒体 identity', async () => {
    const f = fixture();
    try {
      const player = f.accounts.register('maint_player', 'dummy', f.accounts.invite().token);
      const playerSession = f.accounts.createSession(player.id).session;
      f.meta.bind('p_1', playerSession);
      const watcherAccount = f.accounts.register('maint_watcher', 'dummy', f.accounts.invite().token);
      const watcherSession = f.accounts.createSession(watcherAccount.id).session;
      f.meta.watch(watcherSession, 'p_1');
      f.accounts.logout(playerSession.id);
      f.accounts.logout(watcherSession.id);
      await f.maintenance.sweep();

      expect(f.meta.seats.get('p_1')?.sessionId).toBeNull();
      expect(f.meta.watchers.size).toBe(0);
      expect(f.revoked.length).toBe(2);
    } finally { close(f); }
  });
});
