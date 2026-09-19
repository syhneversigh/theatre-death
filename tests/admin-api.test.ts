import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { hashPassword } from '../server/v2/passwords.ts';
import {
  ADMIN_PASSWORD,
  closeAdminHarnesses,
  connectRoom, json,
  jsonPost,
  loginAdmin,
  makeAdminHarness,
  request,
} from './admin-test-helper.ts';

afterEach(async () => { await closeAdminHarnesses(); });

describe('v2 admin account API', () => {
  it('publishes a parseable admin OpenAPI document with every planned endpoint', () => {
    const document = JSON.parse(readFileSync(new URL('../docs/openapi-admin-v2.1.json', import.meta.url), 'utf8')) as { paths: Record<string, Record<string, unknown>> };
    expect(document.paths).toBeTruthy();
    const planned: Array<[string, string]> = [
      ['/auth/login', 'post'], ['/auth/logout', 'post'], ['/me', 'get'], ['/summary', 'get'],
      ['/accounts', 'get'], ['/accounts/{userId}', 'patch'], ['/accounts/{userId}/disable', 'post'],
      ['/accounts/{userId}/enable', 'post'], ['/accounts/{userId}/revoke-sessions', 'post'], ['/accounts/{userId}/clear-avatar', 'post'],
      ['/accounts/{userId}/reset-token', 'post'], ['/invitations', 'get'], ['/invitations', 'post'],
      ['/invitations/{invitationId}', 'patch'], ['/invitations/{invitationId}/revoke', 'post'],
      ['/invitations/{invitationId}/regenerate', 'post'], ['/avatars/{assetId}', 'get'],
    ];
    for (const [path, method] of planned) expect(document.paths[path]?.[method]).toBeTruthy();
  });

  it('returns 404 when admin is not configured and rate-limits password guesses when configured', async () => {
    const unconfigured = await makeAdminHarness(false);
    expect((await request(unconfigured, '/api/v2/admin/me')).status).toBe(404);
    expect((await request(unconfigured, '/api/v2/admin/auth/login', jsonPost({ password: ADMIN_PASSWORD }))).status).toBe(404);

    const configured = await makeAdminHarness(true);
    const bootstrap = await request(configured, '/api/v2/bootstrap');
    const health = await request(configured, '/healthz');
    expect(await bootstrap.text()).not.toContain(ADMIN_PASSWORD);
    expect(await health.text()).not.toContain(ADMIN_PASSWORD);
    const playerCookie = configured.users[0]!.cookie;
    const playerAttempt = await request(configured, '/api/v2/admin/accounts', { headers: { cookie: playerCookie } });
    expect([401, 403]).toContain(playerAttempt.status);
    const evilOrigin = await request(configured, '/api/v2/admin/auth/login', jsonPost({ password: ADMIN_PASSWORD }), undefined, 'http://evil.test');
    expect(evilOrigin.status).toBe(403);
    const adminCookie = await loginAdmin(configured);
    expect(adminCookie).toContain('td_admin_v2=');
    expect(adminCookie).not.toContain('td_account_v2=');
    expect((await request(configured, '/api/v2/admin/me', {}, adminCookie)).status).toBe(200);
    const wrong: Response[] = [];
    for (let index = 0; index < 5; index += 1) wrong.push(await request(configured, '/api/v2/admin/auth/login', jsonPost({ password: 'wrong password value' })));
    expect(wrong.slice(0, 4).every(response => response.status === 401)).toBe(true);
    expect(wrong[4]!.status).toBe(429);
  }, 30_000);

  it('renames uniquely, clears avatar, revokes sessions, and disables/enables accounts through admin authorization', async () => {
    const harness = await makeAdminHarness(true);
    const adminCookie = await loginAdmin(harness);
    const target = harness.users[0]!;
    const other = harness.users[1]!;
    harness.accounts.replaceAvatar(target.userId, 'admin-avatar-asset');
    const rename = await request(harness, `/api/v2/admin/accounts/${target.userId}`, { ...jsonPost({ requestId: 'admin-rename', username: 'renamed_admin_player' }, adminCookie), method: 'PATCH' });
    expect(rename.status).toBe(200);
    expect((await json(rename)).username).toBe('renamed_admin_player');
    const duplicate = await request(harness, `/api/v2/admin/accounts/${target.userId}`, { ...jsonPost({ requestId: 'admin-rename-duplicate', username: other.username }, adminCookie), method: 'PATCH' });
    expect(duplicate.status).toBe(409);
    const clear = await request(harness, `/api/v2/admin/accounts/${target.userId}/clear-avatar`, jsonPost({ requestId: 'admin-clear-avatar' }, adminCookie));
    expect(clear.status).toBe(200);
    expect((await json(clear)).avatarUrl).toBeNull();
    const revoke = await request(harness, `/api/v2/admin/accounts/${target.userId}/revoke-sessions`, jsonPost({ requestId: 'admin-revoke-sessions' }, adminCookie));
    expect(revoke.status).toBe(200);
    expect((await request(harness, '/api/v2/auth/me', {}, target.cookie)).status).toBe(401);
    const disable = await request(harness, `/api/v2/admin/accounts/${target.userId}/disable`, jsonPost({ requestId: 'admin-disable' }, adminCookie));
    expect(disable.status).toBe(200);
    const blockedLogin = await request(harness, '/api/v2/auth/login', jsonPost({ username: target.username, password: target.password }));
    expect([401, 403]).toContain(blockedLogin.status);
    const enable = await request(harness, `/api/v2/admin/accounts/${target.userId}/enable`, jsonPost({ requestId: 'admin-enable' }, adminCookie));
    expect(enable.status).toBe(200);
    expect((await request(harness, '/api/v2/auth/login', jsonPost({ username: 'renamed_admin_player', password: target.password }))).status).toBe(200);

    const literalSearch = await request(harness, '/api/v2/admin/accounts?query=admin_player_2', {}, adminCookie);
    expect((await json(literalSearch)).items).toEqual(expect.arrayContaining([expect.objectContaining({ username: other.username })]));
    const plain = harness.accounts.register('adminXplayerX2', await hashPassword('plain search password'), harness.accounts.invite().token);
    const escapedUnderscore = await request(harness, '/api/v2/admin/accounts?query=adminX_playerX2', {}, adminCookie);
    expect((await json(escapedUnderscore)).items).toEqual([]);
    const escapedPercent = await request(harness, '/api/v2/admin/accounts?query=%25', {}, adminCookie);
    expect((await json(escapedPercent)).items).toEqual([]);
    expect(plain.username).toBe('adminxplayerx2');
  });

  it('creates, lists, revokes, and regenerates invitations with bounded active-only expiry and request idempotency', async () => {
    const harness = await makeAdminHarness(true);
    const adminCookie = await loginAdmin(harness);
    const created = await request(harness, '/api/v2/admin/invitations', jsonPost({ requestId: 'invite-create-1', purpose: 'register', ttlSeconds: 300 }, adminCookie));
    expect(created.status).toBe(201);
    const invite = await json(created);
    expect(invite).toMatchObject({ purpose: 'register' });
    const createdListing = await request(harness, '/api/v2/admin/invitations?status=active', {}, adminCookie);
    const createdItem = (await json(createdListing)).items.find((item: any) => item.id === invite.id);
    expect(createdItem).toMatchObject({ id: invite.id, status: 'active', revokedAt: null, usedAt: null });
    expect(invite.expiresAt - createdItem.createdAt).toBe(300_000);
    const retry = await request(harness, '/api/v2/admin/invitations', jsonPost({ requestId: 'invite-create-1', purpose: 'register', ttlSeconds: 300 }, adminCookie));
    expect(retry.status).toBe(201);
    expect(await json(retry)).toMatchObject({ id: invite.id, token: invite.token });
    const listed = await request(harness, '/api/v2/admin/invitations?activeOnly=true', {}, adminCookie);
    expect(listed.status).toBe(200);
    expect((await json(listed)).items).toEqual(expect.arrayContaining([expect.objectContaining({ id: invite.id, status: 'active' })]));
    const revoked = await request(harness, `/api/v2/admin/invitations/${invite.id}/revoke`, jsonPost({ requestId: 'invite-revoke-1' }, adminCookie));
    expect(revoked.status).toBe(200);
    const revokeRetry = await request(harness, `/api/v2/admin/invitations/${invite.id}/revoke`, jsonPost({ requestId: 'invite-revoke-1' }, adminCookie));
    expect(revokeRetry.status).toBe(200);
    const regenerated = await request(harness, `/api/v2/admin/invitations/${invite.id}/regenerate`, jsonPost({ requestId: 'invite-regenerate-1', ttlSeconds: 86_400 }, adminCookie));
    expect(regenerated.status).toBe(201);
    expect((await json(regenerated)).id).not.toBe(invite.id);
    expect((await request(harness, '/api/v2/auth/invitations/check', jsonPost({ invitation: invite.token }))).status).toBe(403);
  });

  it('removes disabled lobby members with host succession but preserves a disabled player seat during play', async () => {
    const harness = await makeAdminHarness(true);
    const adminCookie = await loginAdmin(harness);
    const lobby = await request(harness, '/api/v2/rooms', jsonPost({ requestId: 'admin-lobby-create' }, harness.users[0]!.cookie));
    expect(lobby.status).toBe(201);
    const lobbyBody = await json(lobby);
    for (let index = 1; index < 13; index += 1) {
      const entered = await request(harness, `/api/v2/rooms/${lobbyBody.roomCode}/enter`, jsonPost({ requestId: `admin-lobby-enter-${index}` }, harness.users[index]!.cookie));
      expect(entered.status).toBe(200);
    }
    await connectRoom(harness, harness.users[1]!, lobbyBody.roomId as string);
    const disabledLobby = await request(harness, `/api/v2/admin/accounts/${harness.users[0]!.userId}/disable`, jsonPost({ requestId: 'admin-disable-lobby-host' }, adminCookie));
    expect(disabledLobby.status).toBe(200);
    const lobbyView = await request(harness, `/api/v2/rooms/${lobbyBody.roomCode}/view`, {}, harness.users[1]!.cookie);
    expect(lobbyView.status).toBe(200);
    const lobbySnapshot = await json(lobbyView);
    expect(lobbySnapshot.room.formalMembers.some((member: any) => member.userId === harness.users[0]!.userId)).toBe(false);
    expect(lobbySnapshot.room.hostMemberId).not.toBe(lobbySnapshot.room.formalMembers.find((member: any) => member.userId === harness.users[0]!.userId)?.memberId);
    const enabled = await request(harness, `/api/v2/admin/accounts/${harness.users[0]!.userId}/enable`, jsonPost({ requestId: 'admin-enable-lobby-host' }, adminCookie));
    expect(enabled.status).toBe(200);
    const replacementSession = harness.accounts.createSession(harness.users[0]!.userId);
    harness.users[0]!.cookie = `td_account_v2=${replacementSession.token}`;

    const reentered = await request(harness, `/api/v2/rooms/${lobbyBody.roomCode}/enter`, jsonPost({ requestId: 'admin-reenter-enabled-host' }, harness.users[0]!.cookie));
    expect(reentered.status).toBe(200);
    for (const user of harness.users.slice(0, 13)) {
      const ready = await request(harness, `/api/v2/rooms/${lobbyBody.roomCode}/ready`, jsonPost({ requestId: `admin-playing-ready-${user.userId}` , ready: true }, user.cookie));
      expect(ready.status).toBe(200);
    }
    const successor = lobbySnapshot.room.formalMembers.find((member: any) => member.memberId === lobbySnapshot.room.hostMemberId);
    const successorUser = harness.users.find(user => user.userId === successor?.userId);
    expect(successorUser).toBeTruthy();
    const started = await request(harness, `/api/v2/rooms/${lobbyBody.roomCode}/start`, jsonPost({ requestId: 'admin-playing-start' }, successorUser!.cookie));
    expect(started.status).toBe(200);
    const playing = { roomCode: lobbyBody.roomCode as string, gameId: (await json(started)).gameId as string };
    const disabledPlaying = await request(harness, `/api/v2/admin/accounts/${harness.users[2]!.userId}/disable`, jsonPost({ requestId: 'admin-disable-playing' }, adminCookie));
    expect(disabledPlaying.status).toBe(200);
    const playingView = await request(harness, `/api/v2/rooms/${playing.roomCode}/view`, {}, harness.users[1]!.cookie);
    expect(playingView.status).toBe(200);
    const playingSnapshot = await json(playingView);
    const retained = playingSnapshot.room.formalMembers.find((member: any) => member.userId === harness.users[2]!.userId);
    expect(retained).toBeTruthy();
    expect(retained.presence).toBe('offline');
    const renameActive = await request(harness, `/api/v2/admin/accounts/${harness.users[2]!.userId}`, { ...jsonPost({ requestId: 'active-rename', username: 'active_rename_forbidden' }, adminCookie), method: 'PATCH' });
    expect(renameActive.status).toBe(409);
  });
});
