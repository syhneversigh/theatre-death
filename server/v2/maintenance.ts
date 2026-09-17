import type { AccountStore } from './account-store.ts';
import type { RoomAccess } from './access.ts';
import type { RoomRegistry } from '../rooms.ts';

export interface MaintenanceDeps {
  accounts: AccountStore; access: Map<string, RoomAccess>; registry: RoomRegistry; now: () => number;
  connected: (gameId: string) => boolean; refresh: (gameId: string) => void; removed: (gameId: string) => void;
}
export function createMaintenance(deps: MaintenanceDeps) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let busy = false;
  const sweep = async () => {
    if (busy) return;
    busy = true;
    try {
      deps.accounts.collectExpired();
      await Promise.all([...deps.access.values()].map((meta) => meta.room.enqueue(() => {
        if (deps.access.get(meta.room.gameId) !== meta) return;
        meta.expireSessions();
        const now = deps.now();
        if (deps.connected(meta.room.gameId)) meta.lastConnectedAt = now;
        if (meta.room.state?.win && meta.endedAt === null) meta.endedAt = now;
        if ((meta.room.state === null && now - meta.lastConnectedAt >= 2 * 3600_000) || (meta.endedAt !== null && now - meta.endedAt >= 24 * 3600_000)) {
          meta.close(); deps.registry.disposeRoom(meta.room.gameId); deps.access.delete(meta.room.gameId); deps.removed(meta.room.gameId);
        }
        deps.refresh(meta.room.gameId);
      })));
    } finally { busy = false; }
  };
  return {
    sweep,
    start() { if (!timer) { timer = setInterval(() => { void sweep().catch(() => console.warn('room_maintenance_failed')); }, 1000); timer.unref(); } },
    stop() { if (timer) clearInterval(timer); timer = undefined; },
  };
}
