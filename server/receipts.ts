import { createHash } from 'node:crypto';
import type { CommandReceipt } from './rooms.ts';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}

export class ReceiptStore {
  private readonly entries = new Map<string, { fingerprint: string; receipt: CommandReceipt }>();
  execute(gameId: string, playerId: string, requestId: string, payload: unknown, apply: () => CommandReceipt): CommandReceipt {
    const key = JSON.stringify([gameId, playerId, requestId]);
    const fingerprint = createHash('sha256').update(JSON.stringify(canonical(payload))).digest('hex');
    const old = this.entries.get(key);
    if (old) return old.fingerprint === fingerprint ? old.receipt : { requestId, status: 'rejected', code: 'request_id_reused', message: '请求编号已用于不同内容' };
    // Reject instead of evicting live-game receipts and permitting an old request to execute again.
    if (this.entries.size >= 10000) return { requestId, status: 'rejected', code: 'receipt_limit', message: '本局请求记录已达上限' };
    const receipt = apply();
    this.entries.set(key, { fingerprint, receipt });
    return receipt;
  }
}
