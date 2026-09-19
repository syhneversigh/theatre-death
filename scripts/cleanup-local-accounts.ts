/** One-time local maintenance. Run only against the stopped frontend-local /data volume. */
import { join, resolve } from 'node:path';
import { AccountStore } from '../server/v2/account-store.ts';

const dataDir = process.env.DATA_DIR;
if (process.env.ALLOW_LOCAL_ACCOUNT_CLEANUP !== 'true' || !dataDir || resolve(dataDir) !== '/data') throw new Error('cleanup requires ALLOW_LOCAL_ACCOUNT_CLEANUP=true and DATA_DIR=/data');
const keepNickname = process.env.KEEP_LOCAL_NICKNAME?.normalize('NFC') ?? 'user_1';
const store = new AccountStore(join(dataDir, 'accounts.sqlite'));
try {
  const keep = store.db.prepare('SELECT id,uid,nickname FROM accounts WHERE nickname=? COLLATE NOCASE').all(keepNickname);
  if (keep.length !== 1) throw new Error(`expected exactly one ${keepNickname} account, found ${keep.length}`);
  const keepId = String(keep[0]!.id);
  const removed: Array<{ uid: string; nickname: string }> = [];
  for (const row of store.db.prepare('SELECT id FROM accounts WHERE id<>? ORDER BY uid').all(keepId)) removed.push(store.deleteAccount(String(row.id)));
  console.log(JSON.stringify({ kept: { userId: keepId, uid: String(keep[0]!.uid), nickname: String(keep[0]!.nickname) }, removedCount: removed.length, removed }, null, 2));
} finally { store.close(); }
