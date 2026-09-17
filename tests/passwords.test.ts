import { describe, expect, it } from 'vitest';
import { ApiError } from '../server/v2/errors.ts';
import { hashPassword, validatePassword, verifyPassword, PasswordWorkQueue } from '../server/v2/passwords.ts';

describe('v2 password hashing and work queue', () => {
  it('hashes valid passwords with scrypt and verifies correct and incorrect values', async () => {
    const stored = await hashPassword('correct horse battery staple');
    const parsed = JSON.parse(stored) as { algorithm: string; N: number; r: number; p: number; salt: string; hash: string };
    expect(parsed).toMatchObject({ algorithm: 'scrypt', N: 2 ** 17, r: 8, p: 1 });
    expect(parsed.salt).toMatch(/^[0-9a-f]{32}$/);
    expect(parsed.hash).toMatch(/^[0-9a-f]{128}$/);
    await expect(verifyPassword('correct horse battery staple', stored)).resolves.toBe(true);
    await expect(verifyPassword('incorrect horse battery staple', stored)).resolves.toBe(false);
  });

  it('uses a random salt for each hash', async () => {
    const first = JSON.parse(await hashPassword('same password value')) as { salt: string; hash: string };
    const second = JSON.parse(await hashPassword('same password value')) as { salt: string; hash: string };
    expect(first.salt).not.toBe(second.salt);
    expect(first.hash).not.toBe(second.hash);
    await expect(verifyPassword('same password value', JSON.stringify(first))).resolves.toBe(true);
    await expect(verifyPassword('same password value', JSON.stringify(second))).resolves.toBe(true);
  });

  it('rejects passwords outside the 12 to 128 character range', async () => {
    expect(() => validatePassword('short')).toThrowError(ApiError);
    expect(() => validatePassword('x'.repeat(129))).toThrowError(ApiError);
    expect(() => validatePassword(null)).toThrowError(ApiError);
    await expect(hashPassword('x'.repeat(11))).rejects.toMatchObject({ status: 400, code: 'password_length' });
    await expect(verifyPassword('x'.repeat(129), null)).resolves.toBe(false);
  });

  it('limits work to two active tasks and releases a slot after failure', async () => {
    const queue = new PasswordWorkQueue();
    let active = 0;
    let maximum = 0;
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    const first = queue.run(() => new Promise<string>((resolve) => {
      active += 1;
      maximum = Math.max(maximum, active);
      releaseFirst = () => { active -= 1; resolve('first'); };
    }));
    const second = queue.run(() => new Promise<string>((resolve) => {
      active += 1;
      maximum = Math.max(maximum, active);
      releaseSecond = () => { active -= 1; resolve('second'); };
    }));
    let thirdStarted = false;
    const third = queue.run(async () => {
      thirdStarted = true;
      active += 1;
      maximum = Math.max(maximum, active);
      active -= 1;
      return 'third';
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(maximum).toBe(2);
    expect(thirdStarted).toBe(false);
    releaseFirst();
    await expect(first).resolves.toBe('first');
    await expect(third).resolves.toBe('third');
    releaseSecond();
    await expect(second).resolves.toBe('second');

    await expect(queue.run(async () => { throw new Error('worker failed'); })).rejects.toThrow('worker failed');
    await expect(queue.run(async () => 'after failure')).resolves.toBe('after failure');
  });
});
