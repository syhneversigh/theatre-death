import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import type { CatalogDTO } from '../../contracts/catalog.ts';
import type { CommandAction, RoomSnapshot, TaskDTO } from '../../contracts/v2.ts';
export type { CommandAction, RoomSnapshot, TaskDTO } from '../../contracts/v2.ts';

export interface GameHarnessFixture { view: RoomSnapshot; catalog: CatalogDTO; online: boolean }

function readFixture<T>(name: string): T {
  return JSON.parse(readFileSync('/contract-fixtures/' + name, 'utf8')) as T;
}

export function loadGameFixture(viewName = 'night-door-full.json'): GameHarnessFixture {
  return { view: readFixture<RoomSnapshot>(viewName), catalog: readFixture<CatalogDTO>('catalog-full.json'), online: true };
}

export function taskFixture(view: RoomSnapshot, action: CommandAction, targets: TaskDTO['targets'] = null, windowInstanceId = 'fixture:' + action): GameHarnessFixture {
  const next = structuredClone(view);
  const windowTypes: Partial<Record<CommandAction, string>> = { SUBMIT_GUARD: 'guard', SUBMIT_LAIKE: 'laike', EDIT_PROPOSAL: 'faction', CONFIRM_PROPOSAL: 'faction', SUBMIT_CHECK: 'check', SUBMIT_RESCUE: 'rescue', SUBMIT_REVIVE: 'revive' };
  next.serverTime += 10_000;
  next.room.phase = 'playing';
  next.tasks = [{ action, windowInstanceId, closesAt: next.serverTime + 60_000, targets }];
  next.windows = [{ id: action, type: windowTypes[action] ?? 'public', instanceId: windowInstanceId, closesAt: next.serverTime + 60_000 }];
  next.capabilities.allowedCommands = [action];
  return { view: next, catalog: readFixture<CatalogDTO>('catalog-full.json'), online: true };
}

export async function pushFixture(page: Page, fixture: GameHarnessFixture): Promise<void> {
  await page.evaluate((next: any) => window.dispatchEvent(new CustomEvent('v2-game-fixture-update', { detail: next })), fixture as any);
}

export async function fixtureRoute(page: Page, fixture: GameHarnessFixture): Promise<{ set: (next: GameHarnessFixture) => void }> {
  let current = fixture;
  await page.route('**/__game-fixture', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(current) });
  });
  return { set: next => { current = next; } };
}

export function alivePlayers(view: RoomSnapshot): string[] {
  return (view.public?.seats ?? []).filter((seat: any) => seat.alive).map((seat: any) => seat.playerId);
}

export function resizeSeats(view: RoomSnapshot, count: number): RoomSnapshot {
  const next = structuredClone(view);
  const source = next.public!.seats;
  next.public!.seats = Array.from({ length: count }, (_, index) => {
    const base = source[index % source.length]!;
    return { ...base, playerId: 'fixture-player-' + (index + 1), seat: index + 1, username: '座位' + (index + 1), memberId: 'fixture-member-' + (index + 1) };
  });
  next.room.requiredPlayers = count;
  next.room.formalMembers = next.room.formalMembers.map((member, index) => ({ ...member, userId: 'fixture-user-' + (index + 1), memberId: 'fixture-member-' + (index + 1), playerId: next.public!.seats[index % count]!.playerId, username: '座位' + (index + 1) }));
  const publicGame = next.public!;
  next.viewer.subjectPlayerId = publicGame.seats[0]?.playerId ?? null;
  if (publicGame.seats[0]) { next.viewer.userId = 'fixture-user-1'; next.viewer.memberId = 'fixture-member-1'; if (next.private) { next.private.self.playerId = publicGame.seats[0].playerId; next.private.self.seat = 1; next.private.self.username = publicGame.seats[0].username; } }
  return next;
}
