import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AccountStore } from '../server/v2/account-store.ts';
import { ApiError } from '../server/v2/errors.ts';

const WEEK = 7 * 86400_000;
const dirs: string[] = [];
const stores: AccountStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function open(now: { value: number }, persistent = false): { store: AccountStore; path: string } {
  const dir = mkdtempSync(join(tmpdir(), 'theater-account-test-'));
  dirs.push(dir);
  const path = persistent ? join(dir, 'accounts.sqlite') : ':memory:';
  const store = new AccountStore(path, () => now.value);
  stores.push(store);
  return { store, path };
}

function expectApiError(action: () => unknown, status: number, code: string): void {
  try {
    action();
    throw new Error('expected ApiError');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status, code });
  }
}

describe('v2 account store', () => {
  it('registration invite expires at seven days and is one-time', () => {
    const now = { value: 1_000 };
    const { store } = open(now);
    const invitation = store.invite();
    expect(invitation.expiresAt).toBe(now.value + WEEK);
    expect(store.validInvite(invitation.token, 'register')).not.toBeNull();

    now.value = invitation.expiresAt;
    expect(store.validInvite(invitation.token, 'register')).toBeNull();

    now.value = 1_000;
    const usable = store.invite();
    const account = store.register('Alice', 'hash-a', usable.token);
    expect(account.username).toBe('alice');
    expect(store.validInvite(usable.token, 'register')).toBeNull();
    expectApiError(() => store.register('another', 'hash-b', usable.token), 403, 'invalid_invitation');
  });

  it('duplicate username rolls back without consuming the second invite', () => {
    const now = { value: 2_000 };
    const { store } = open(now);
    const first = store.invite();
    store.register('Alice', 'hash-a', first.token);
    const second = store.invite();

    expectApiError(() => store.register('ALICE', 'hash-b', second.token), 409, 'username_taken');
    expect(store.validInvite(second.token, 'register')).not.toBeNull();
  });

  it('reopens persisted accounts and runs schema migration idempotently', () => {
    const now = { value: 3_000 };
    const first = open(now, true);
    const invitation = first.store.invite();
    const account = first.store.register('Persisted_User', 'hash-p', invitation.token);
    first.store.close();
    stores.splice(stores.indexOf(first.store), 1);

    const reopened = new AccountStore(first.path, () => now.value);
    stores.push(reopened);
    expect(reopened.byName('persisted_user')).toMatchObject({ id: account.id, username: 'persisted_user' });
    reopened.close();
    stores.splice(stores.indexOf(reopened), 1);

    const reopenedAgain = new AccountStore(first.path, () => now.value);
    stores.push(reopenedAgain);
    expect(reopenedAgain.byName('PERSISTED_USER')?.passwordHash).toBe('hash-p');
  });

  it('sessions expire and password reset revokes every session for the account', () => {
    const now = { value: 4_000 };
    const { store } = open(now);
    const registration = store.invite();
    const account = store.register('ResetMe', 'old-hash', registration.token);
    const sessionA = store.createSession(account.id);
    const sessionB = store.createSession(account.id);
    expect(store.session(sessionA.token)?.userId).toBe(account.id);
    now.value += WEEK;
    expect(store.session(sessionA.token)).toBeNull();
    store.collectExpired();
    expect(store.sessionActive(sessionB.session.id)).toBe(false);

    const freshA = store.createSession(account.id);
    const freshB = store.createSession(account.id);
    const reset = store.invite('reset', 'resetme');
    expect(store.resetPassword(reset.token, 'new-hash')).toBe(account.id);
    expect(store.byName('resetme')?.passwordHash).toBe('new-hash');
    expect(store.session(freshA.token)).toBeNull();
    expect(store.session(freshB.token)).toBeNull();
  });

  it('persists only digests for invitations and sessions', () => {
    const now = { value: 5_000 };
    const { store } = open(now);
    const registration = store.invite();
    const account = store.register('SecretUser', 'hash-s', registration.token);
    const session = store.createSession(account.id);
    const reset = store.invite('reset', 'secretuser');
    const rows = store.db.prepare('SELECT token_hash, purpose FROM invitations').all() as Array<{ token_hash: string; purpose: string }>;
    const sessionRows = store.db.prepare('SELECT id FROM sessions').all() as Array<{ id: string }>;

    expect(rows.map((row) => row.token_hash)).not.toContain(registration.token);
    expect(rows.map((row) => row.token_hash)).not.toContain(reset.token);
    expect(sessionRows.map((row) => row.id)).not.toContain(session.token);
    expect(rows.every((row) => /^[0-9a-f]{64}$/.test(row.token_hash))).toBe(true);
    expect(sessionRows.every((row) => /^[0-9a-f]{64}$/.test(row.id))).toBe(true);
  });
});
