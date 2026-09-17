import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { AccountStore } from '../server/v2/account-store.ts';
import { hashPassword } from '../server/v2/passwords.ts';

/**
 * Prepare the account/session fixture for the external v2 load client.
 * Run this in the load container with DATA_DIR mounted to /app/data-v2.
 * The fixture contains test credentials by design; capacity.json never does.
 */
const dataDir = process.env.DATA_DIR ?? '/app/data-v2';
const fixturePath = process.env.FIXTURE_PATH ?? '/app/test-results-v2/load-fixture.json';
const password = process.env.LOAD_PASSWORD ?? 'capacity-load-password-2026';
const accountCount = Number(process.env.ACCOUNT_COUNT ?? 100);

if (!Number.isSafeInteger(accountCount) || accountCount < 100) throw new Error('ACCOUNT_COUNT must be at least 100');
if (password.length < 12) throw new Error('LOAD_PASSWORD must be at least 12 characters');

await mkdir(dataDir, { recursive: true });
await mkdir(dirname(fixturePath), { recursive: true });
const store = new AccountStore(join(dataDir, 'accounts.sqlite'));
try {
  const existing = store.db.prepare('SELECT COUNT(*) AS count FROM accounts').get() as { count: number };
  if (Number(existing.count) !== 0) throw new Error(`refusing non-empty account store (${existing.count} accounts)`);

  // One expensive derivation is deliberately shared by the load-only accounts.
  const passwordHash = await hashPassword(password);
  const accounts = [] as Array<{ username: string; userId: string; cookie: string }>;
  for (let index = 1; index <= accountCount; index += 1) {
    const username = `load_${String(index).padStart(3, '0')}`;
    const account = store.register(username, passwordHash, store.invite().token);
    const session = store.createSession(account.id);
    accounts.push({ username, userId: account.id, cookie: `td_account_v2=${session.token}` });
  }
  await writeFile(fixturePath, JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl: process.env.BASE_URL ?? 'http://load-app:3000', password, accounts }, null, 2));
} finally {
  store.close();
}
