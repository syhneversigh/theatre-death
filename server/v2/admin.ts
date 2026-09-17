import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { AccountStore } from './account-store.ts';

const dir = process.env.DATA_DIR ?? './data-v2';
mkdirSync(dir, { recursive: true });
const store = new AccountStore(join(dir, 'accounts.sqlite'));
try {
  const [command, value] = process.argv.slice(2);
  switch (command) {
    case 'invite': console.log(JSON.stringify(store.invite())); break;
    case 'revoke-invite': if (!value) throw new Error('Invitation id required'); store.revokeInvite(value); console.log('Invitation revoked'); break;
    case 'reset-password': if (!value) throw new Error('Username required'); console.log(JSON.stringify(store.invite('reset', value))); break;
    default: throw new Error('Usage: admin.ts invite | revoke-invite <id> | reset-password <username>');
  }
} finally { store.close(); }
