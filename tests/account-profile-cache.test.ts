import { afterEach, describe, expect, it } from 'vitest';
import { AccountStore } from '../server/v2/account-store.ts';

const stores: AccountStore[] = [];
afterEach(() => { for (const store of stores.splice(0).reverse()) store.close(); });

function account(now = 1_000) {
  const store = new AccountStore(':memory:', () => now);
  stores.push(store);
  const row = store.register('cache_user', 'hash', store.invite().token);
  return { store, userId: row.id };
}

describe('AccountStore profile memo', () => {
  it('returns equal profiles without sharing mutable objects', () => {
    const { store, userId } = account();
    const first = store.profile(userId);
    first.username = 'mutated-client-copy';
    const second = store.profile(userId);
    expect(second).toEqual({ userId, username: 'cache_user', avatarUrl: null, profileVersion: 0 });
    expect(second).not.toBe(first);
  });

  it('publishes committed avatar updates immediately and returned mutations do not poison the cache', () => {
    const { store, userId } = account();
    const first = store.replaceAvatar(userId, '11111111-1111-4111-8111-111111111111');
    first.avatarUrl = '/spoofed-client-url';
    expect(store.profile(userId)).toMatchObject({ avatarUrl: '/api/v2/avatars/11111111-1111-4111-8111-111111111111', profileVersion: 1 });
    const second = store.replaceAvatar(userId, '22222222-2222-4222-8222-222222222222');
    expect(second).toMatchObject({ avatarUrl: '/api/v2/avatars/22222222-2222-4222-8222-222222222222', profileVersion: 2 });
    expect(store.profile(userId)).toEqual(second);
  });

  it('keeps the old profile and leaves no new asset after a real SQLite transaction abort', () => {
    const { store, userId } = account();
    const old = store.replaceAvatar(userId, '33333333-3333-4333-8333-333333333333');
    store.db.exec("CREATE TRIGGER abort_avatar BEFORE UPDATE OF avatar_id ON accounts BEGIN SELECT RAISE(ABORT, 'avatar_abort'); END");
    expect(() => store.replaceAvatar(userId, '44444444-4444-4444-8444-444444444444')).toThrow();
    expect(store.profile(userId)).toEqual(old);
    expect(store.db.prepare('SELECT avatar_id,profile_version FROM accounts WHERE id=?').get(userId)).toMatchObject({ avatar_id: '33333333-3333-4333-8333-333333333333', profile_version: 1 });
    expect(store.db.prepare('SELECT id FROM avatar_assets ORDER BY id').all().map((row) => String((row as { id: string }).id))).toEqual(['33333333-3333-4333-8333-333333333333']);
  });

  it('does not cache sessions: logout and expiry revoke a warmed profile account immediately', () => {
    let now = 1_000;
    const store = new AccountStore(':memory:', () => now);
    stores.push(store);
    const row = store.register('session_cache_user', 'hash', store.invite().token);
    const session = store.createSession(row.id).session;
    expect(store.profile(row.id).username).toBe('session_cache_user');
    expect(store.sessionActive(session.id)).toBe(true);
    store.logout(session.id);
    expect(store.sessionActive(session.id)).toBe(false);
    const session2 = store.createSession(row.id).session;
    now = session2.expiresAt;
    expect(store.sessionActive(session2.id)).toBe(false);
  });
});
