import { describe, expect, it } from 'vitest';
import { createProposalState, editProposal, confirmProposal, resolvedProposal } from '../engine/proposal.ts';
import { createFakeClock } from '../server/clock.ts';
import { createNightDriver } from '../server/night-driver.ts';
import { THEATER_DEATH_13_V2 } from '../rulesets/theater-death-13-v2.ts';
import type { RulesetConfig } from '../rulesets/types.ts';
import { scenario } from './helpers.ts';

const members = ['a', 'b', 'c'] as const;

function finishNight(state: ReturnType<typeof scenario>, submit?: (driver: ReturnType<typeof createNightDriver>) => void) {
  const clock = createFakeClock();
  const driver = createNightDriver({ clock, onStep: () => undefined });
  driver.start(state);
  submit?.(driver);
  clock.advance(state.ruleset.timersSeconds.faction * 1000);
  clock.advance(state.ruleset.timersSeconds.ability * 1000);
  if (!driver.done()) clock.advance(state.ruleset.timersSeconds.ability * 1000);
  return { clock, driver };
}

describe('v2 团队方案兜底', () => {
  it('全员确认版本优先于之后更新但未确认的草稿', () => {
    let state = createProposalState();
    state = editProposal(state, members, 'a', ['t1']);
    for (const member of members) state = confirmProposal(state, members, member, 1);
    state = editProposal(state, members, 'b', ['t2']);

    expect(resolvedProposal(state, members, true)?.targetPlayerIds).toEqual(['t1']);
  });

  it('没有全员确认时取最后一个合法草稿，包括空目标草稿', () => {
    let state = createProposalState();
    state = editProposal(state, members, 'a', ['t1']);
    state = editProposal(state, members, 'b', []);

    expect(resolvedProposal(state, members, true)?.targetPlayerIds).toEqual([]);
  });

  it('没有任何草稿时保持空刀', () => {
    expect(resolvedProposal(createProposalState(), members, true)).toBeNull();
  });

  it('非法超额提交被拒绝且不污染最后合法方案', () => {
    const { driver } = finishNight({ ...scenario(), ruleset: THEATER_DEATH_13_V2 }, (night) => {
      expect(night.submit({ type: 'EDIT_PROPOSAL', playerId: 'p_10', targets: ['p_5'] }).accepted).toBe(true);
      expect(night.submit({ type: 'EDIT_PROPOSAL', playerId: 'p_10', targets: ['p_5', 'p_6', 'p_7'] }).code).toBe('death_targets_exceeded');
      expect(night.proposalState('p_10')?.targetPlayerIds).toEqual(['p_5']);
    });
    expect(driver.snapshot()?.night?.deaths).toEqual(['p_5']);
  });

  it('二阶段联合池无全员确认时采用最后合法的两目标方案', () => {
    const state = { ...scenario(), stage: 2 as const, ruleset: THEATER_DEATH_13_V2 };
    const { driver } = finishNight(state, (night) => {
      expect(night.submit({ type: 'EDIT_PROPOSAL', playerId: 'p_10', targets: ['p_6', 'p_7'] }).accepted).toBe(true);
    });

    expect(driver.snapshot()?.night?.deaths).toEqual(['p_6', 'p_7']);
  });

  it('三魂灵实验组合的活动成员都可提交，最后合法草稿生效', () => {
    const roles = { ...THEATER_DEATH_13_V2.roles, spirit: 3 };
    const ruleset: RulesetConfig = { ...THEATER_DEATH_13_V2, mode: 'experimental', roles };
    const seatRoles = ['laike', 'door', 'water', 'descender', 'researcher', 'civilian', 'civilian', 'civilian', 'civilian', 'death', 'spirit', 'spirit', 'spirit'] as const;
    const state = { ...scenario(seatRoles), ruleset };
    const { driver } = finishNight(state, (night) => {
      expect(night.submit({ type: 'EDIT_PROPOSAL', playerId: 'p_11', targets: ['p_5'] }).accepted).toBe(true);
      expect(night.submit({ type: 'EDIT_PROPOSAL', playerId: 'p_12', targets: ['p_6'] }).accepted).toBe(true);
      expect(night.submit({ type: 'EDIT_PROPOSAL', playerId: 'p_13', targets: ['p_7'] }).accepted).toBe(true);
    });

    expect(driver.snapshot()?.night?.deaths).toEqual(['p_7']);
  });
});
