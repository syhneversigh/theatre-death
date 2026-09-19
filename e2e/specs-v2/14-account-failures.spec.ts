import { expect, test, type Page } from '@playwright/test';
import { loadAccountCase, staticPng } from '../helpers-v2/account.ts';
import { loadRoomAccounts, loginRoomAccount } from '../helpers-v2/rooms.ts';

async function openAuth(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '欢迎入席' })).toBeVisible();
}

async function login(page: Page, username: string, password: string): Promise<void> {
  await page.getByLabel('账号').fill(username);
  await page.getByLabel('登录密码').fill(password);
  await page.getByRole('button', { name: /进入剧院/ }).click();
  await expect(page.getByRole('heading', { name: '下一场，等你入席。' })).toBeVisible();
}

async function openAccount(page: Page): Promise<void> {
  await page.getByRole('button', { name: '我的账户' }).click();
  await expect(page.getByRole('heading', { name: '你的账户' })).toBeVisible();
}

function releaseSafely(release: (() => void) | null): void {
  if (release) release();
}

test('注册失败反馈、延迟响应双击只发一次且最终可登录', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const account = loadAccountCase(testInfo.project.name);
  let registerAttempts = 0;
  let releaseRegister: () => void = () => {};
  let fetchedRegister: () => void = () => {};
  const registerGate = new Promise<void>(resolve => { releaseRegister = resolve; });
  const registerFetched = new Promise<void>(resolve => { fetchedRegister = resolve; });
  await page.route('**/api/v2/auth/register', async route => {
    registerAttempts += 1;
    try {
      const response = await route.fetch();
      fetchedRegister();
      await registerGate;
      await route.fulfill({ response });
    } finally { releaseRegister(); }
  });
  try {
  await openAuth(page);
  await page.getByRole('button', { name: '使用邀请码注册' }).click();
  await page.getByLabel('注册邀请码').fill('definitely-invalid-invitation');
  await page.getByRole('button', { name: /验证邀请码/ }).click();
  await expect(page.getByRole('alert')).toContainText('邀请码无效、已使用或已过期');

  await page.getByLabel('注册邀请码').fill(account.invitation);
  await page.getByRole('button', { name: /验证邀请码/ }).click();
  await expect(page.getByRole('heading', { name: '留下你的名字' })).toBeVisible();
  await page.getByLabel('账号').fill(account.username);
  await page.getByLabel('设置新密码').fill(account.password);
  await page.getByLabel('确认密码').fill(account.password);
  const submit = page.locator('form button[type="submit"]');
  await submit.dblclick();
  await expect.poll(() => registerAttempts).toBe(1);
  await registerFetched;
  await expect(submit).toBeDisabled();
  expect(registerAttempts).toBe(1);
  releaseRegister();
  await expect(page.getByRole('heading', { name: '下一场，等你入席。' })).toBeVisible();
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page.getByRole('heading', { name: '欢迎入席' })).toBeVisible();
  await login(page, account.username, account.password);
  expect((await page.request.get('/api/v2/auth/me')).status()).toBe(200);
  } finally { releaseRegister(); }
});

test('头像服务端存储失败保留旧图/profileVersion并可重试恢复', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const account = loadRoomAccounts(testInfo.project.name)[6]!;
  await loginRoomAccount(page, account);
  await openAccount(page);
  const before = await page.request.get('/api/v2/auth/me');
  const beforeProfile = await before.json() as { avatarUrl: string | null; profileVersion: number };

  await page.getByRole('button', { name: '更换头像' }).click();
  await page.getByLabel('选择头像图片').setInputFiles({ name: 'old.png', mimeType: 'image/png', buffer: staticPng() });
  await expect(page.getByRole('img', { name: '裁剪后的头像预览' })).toBeVisible();
  await page.getByRole('button', { name: '保存头像' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const oldResponse = await page.request.get('/api/v2/auth/me');
  const oldProfile = await oldResponse.json() as { avatarUrl: string; profileVersion: number };
  expect(oldProfile.avatarUrl).toMatch(/^\/api\/v2\/avatars\//);
  expect(oldProfile.profileVersion).toBeGreaterThan(beforeProfile.profileVersion);

  let failOnce = true;
  await page.route('**/api/v2/me/avatar', async route => {
    if (route.request().method() === 'PUT' && failOnce) {
      failOnce = false;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'avatar_storage_unavailable' } }) });
      return;
    }
    await route.continue();
  });
  await page.getByRole('button', { name: '更换头像' }).click();
  await page.getByLabel('选择头像图片').setInputFiles({ name: 'new.png', mimeType: 'image/png', buffer: staticPng() });
  await expect(page.getByRole('img', { name: '裁剪后的头像预览' })).toBeVisible();
  await page.getByRole('button', { name: '保存头像' }).click();
  await expect(page.getByRole('alert')).toContainText('头像暂时无法保存，原头像已保留');
  const failedProfile = await (await page.request.get('/api/v2/auth/me')).json() as { avatarUrl: string; profileVersion: number };
  expect(failedProfile).toMatchObject({ avatarUrl: oldProfile.avatarUrl, profileVersion: oldProfile.profileVersion });
  const oldImages = page.locator(`img[alt="${account.username}的头像"]`);
  await expect(oldImages).toHaveCount(2);
  const displayedAvatarSources = await oldImages.evaluateAll(images => images.map(image => (image as HTMLImageElement).src));
  expect(displayedAvatarSources.every(source => source.endsWith(oldProfile.avatarUrl))).toBe(true);
  await expect(page.getByRole('button', { name: '保存头像' })).toBeEnabled();
  await page.getByRole('button', { name: '保存头像' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const recovered = await (await page.request.get('/api/v2/auth/me')).json() as { avatarUrl: string; profileVersion: number };
  expect(recovered.avatarUrl).toMatch(/^\/api\/v2\/avatars\//);
  expect(recovered.profileVersion).toBeGreaterThan(oldProfile.profileVersion);
});
