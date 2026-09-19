/** Disposable test access only. Never point this helper at an existing deployment. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import { AccountStore } from '../server/v2/account-store.ts';
import { hashPassword } from '../server/v2/passwords.ts';

const dir = process.env.DATA_DIR;
if (!dir || resolve(dir) !== '/app/data-frontend-v2') throw new Error('This seed helper requires the isolated frontend database.');
mkdirSync(dir, { recursive: true });
mkdirSync('/test-access', { recursive: true });
const store = new AccountStore(join(dir, 'accounts.sqlite'));
try {
  const run = randomBytes(5).toString('hex');
  const accounts: Record<string, unknown> = {};
  for (const browser of ['chromium', 'webkit']) {
    const password = randomBytes(18).toString('base64url');
    const resetUsername = `ur_${run}_${browser}`;
    store.register(resetUsername, await hashPassword(password), store.invite().token);
    const roomUsers: { username: string; password: string; userId: string }[] = [];
    for (let index = 0; index < 7; index++) {
      const username = `room_${run}_${browser}_${index}`;
      const roomPassword = randomBytes(18).toString('base64url');
      const account = store.register(username, await hashPassword(roomPassword), store.invite().token);
      roomUsers.push({ username, password: roomPassword, userId: account.id });
    }
    const fullGameUsers: { username: string; password: string; userId: string }[] = [];
    for (let index = 0; index < 13; index++) {
      const username = 'full_' + run + '_' + browser + '_' + index;
      const fullPassword = randomBytes(18).toString('base64url');
      const account = store.register(username, await hashPassword(fullPassword), store.invite().token);
      fullGameUsers.push({ username, password: fullPassword, userId: account.id });
    }
    accounts[browser] = {
      username: `ui_${run}_${browser}`, password, invitation: store.invite().token,
      lost: { username: `ul_${run}_${browser}`, password: randomBytes(18).toString('base64url'), invitation: store.invite().token },
      reset: { username: resetUsername, password: randomBytes(18).toString('base64url'), token: store.invite('reset', resetUsername).token },
      rooms: roomUsers,
      fullGame: fullGameUsers,
    };
  }
  writeFileSync('/test-access/accounts.json', JSON.stringify(accounts), { mode: 0o600 });
  console.log('Prepared disposable frontend account cases; access is in the private test volume.');
} finally { store.close(); }
