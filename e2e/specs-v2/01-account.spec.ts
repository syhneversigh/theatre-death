import { expect, test, type Page } from '@playwright/test';
import { loadAccountCase, newPasswordFor, staticPng, invalidSvg, corruptPng } from '../helpers-v2/account.ts';

interface AvatarUploadObservation {
  length: number;
  signature: number[];
  contentType: string | null;
}

async function openAuth(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '欢迎入席' })).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function installAvatarFetchProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    const observations: AvatarUploadObservation[] = [];
    Object.defineProperty(window, '__v2AvatarUploadObservations', { value: observations, writable: false });
    window.fetch = async (input, init) => {
      const request = new Request(input, init);
      const url = new URL(request.url, window.location.href);
      if (request.method === 'PUT' && url.pathname === '/api/v2/me/avatar') {
        const body = new Uint8Array(await request.clone().arrayBuffer());
        observations.push({ length: body.length, signature: Array.from(body.subarray(0, 12)), contentType: request.headers.get('content-type') });
      }
      return nativeFetch(input, init);
    };
  });
}

async function avatarUploadObservations(page: Page): Promise<AvatarUploadObservation[]> {
  return page.evaluate(() => (window as unknown as { __v2AvatarUploadObservations: AvatarUploadObservation[] }).__v2AvatarUploadObservations);
}

function expectImageSignature(observation: AvatarUploadObservation): void {
  expect(observation.length).toBeGreaterThan(32);
  const isJpeg = observation.signature[0] === 0xff && observation.signature[1] === 0xd8 && observation.signature[2] === 0xff;
  const isPng = observation.signature.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10';
  const isWebp = observation.signature.slice(0, 4).join(',') === '82,73,70,70' && observation.signature.slice(8, 12).join(',') === '87,69,66,80';
  if (observation.contentType === 'image/jpeg') expect(isJpeg).toBe(true);
  else if (observation.contentType === 'image/png') expect(isPng).toBe(true);
  else if (observation.contentType === 'image/webp') expect(isWebp).toBe(true);
  else throw new Error(`unexpected avatar upload content type: ${observation.contentType}`);
}

async function login(page: Page, username: string, password: string): Promise<void> {
  await page.getByLabel('账号').fill(username);
  await page.getByLabel('登录密码').fill(password);
  await page.getByRole('button', { name: /进入剧院/ }).click();
  await expect(page.getByRole('heading', { name: '下一场，等你入席。' })).toBeVisible();
}

async function submitRegistration(page: Page, account: { username: string; password: string; invitation: string }): Promise<void> {
  await page.getByRole('button', { name: '使用邀请码注册' }).click();
  await page.getByLabel('注册邀请码').fill(account.invitation);
  await page.getByRole('button', { name: /验证邀请码/ }).click();
  await expect(page.getByRole('heading', { name: '留下你的名字' })).toBeVisible();
  await page.getByLabel('账号').fill(account.username);
  await page.getByLabel('设置新密码').fill(account.password);
  await page.getByLabel('确认密码').fill(account.password);
  await page.getByRole('button', { name: /创建账号并入席/ }).click();
}

async function register(page: Page, account: { username: string; password: string; invitation: string }): Promise<void> {
  await submitRegistration(page, account);
  await expect(page.getByRole('heading', { name: '下一场，等你入席。' })).toBeVisible();
}

async function openAccount(page: Page): Promise<void> {
  await page.getByRole('button', { name: '我的账户' }).click();
  await expect(page.getByRole('heading', { name: '你的账户' })).toBeVisible();
}

test('注册、刷新恢复、头像编辑与全会话改密', async ({ page, browser }, testInfo) => {
  test.setTimeout(120_000);
  const account = loadAccountCase(testInfo.project.name);
  const changedPassword = newPasswordFor(account.username);
  await installAvatarFetchProbe(page);
  await openAuth(page);
  await register(page, account);
  await openAccount(page);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `/results/account-${testInfo.project.name}.png` });

  await page.reload();
  await expect(page.getByRole('heading', { name: '你的账户' })).toBeVisible();

  const profileBefore = await page.request.get('/api/v2/auth/me');
  expect(profileBefore.status()).toBe(200);
  const before = await profileBefore.json() as { avatarUrl: string | null; profileVersion: number };
  expect(before.avatarUrl).toBeNull();

  let avatarUploads = 0;
  await page.route('**/api/v2/me/avatar', async route => {
    if (route.request().method() === 'PUT') avatarUploads += 1;
    await route.continue();
  });

  await page.getByRole('button', { name: '更换头像' }).click();
  await page.getByLabel('选择头像图片').setInputFiles({ name: 'preview.png', mimeType: 'image/png', buffer: staticPng() });
  await expect(page.getByRole('img', { name: '裁剪后的头像预览' })).toBeVisible();
  await page.getByRole('button', { name: '取消' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(avatarUploads).toBe(0);

  await page.getByRole('button', { name: '更换头像' }).click();
  await page.getByLabel('选择头像图片').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: staticPng() });
  await expect(page.getByRole('img', { name: '裁剪后的头像预览' })).toBeVisible();
  await page.getByLabel('头像缩放').fill('2');
  await page.getByLabel('头像水平位置').fill('1');
  await page.getByLabel('头像垂直位置').fill('-1');
  const uploadResponse = page.waitForResponse(response => response.url().endsWith('/api/v2/me/avatar') && response.request().method() === 'PUT');
  await page.getByRole('button', { name: '保存头像' }).click();
  const uploaded = await uploadResponse;
  expect(uploaded.status()).toBe(200);
  const uploadBody = await uploaded.json() as { avatarUrl: string; profileVersion: number };
  const uploadObservations = await avatarUploadObservations(page);
  expect(uploadObservations).toHaveLength(1);
  expectImageSignature(uploadObservations[0]!);
  expect(uploadBody.avatarUrl).toMatch(/^\/api\/v2\/avatars\//);
  expect(uploadBody.profileVersion).toBeGreaterThan(before.profileVersion);
  const avatarResponse = await page.request.get(uploadBody.avatarUrl);
  expect(avatarResponse.status()).toBe(200);
  expect(avatarResponse.headers()['content-type']).toContain('image/webp');
  const avatarBytes = await avatarResponse.body();
  expect(avatarBytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
  expect(avatarBytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
  const avatarImages = page.locator(`img[alt="${account.username}的头像"]`);
  await expect(avatarImages).toHaveCount(2);
  await expect.poll(async () => await avatarImages.evaluateAll(images => images.every(image => {
    const img = image as HTMLImageElement;
    return img.complete && img.naturalWidth > 0;
  }))).toBe(true);

  const profileAfterAvatar = await page.request.get('/api/v2/auth/me');
  const afterAvatar = await profileAfterAvatar.json() as { avatarUrl: string | null; profileVersion: number };
  expect(afterAvatar.avatarUrl).toBe(uploadBody.avatarUrl);
  expect(afterAvatar.profileVersion).toBe(uploadBody.profileVersion);

  await page.getByRole('button', { name: '更换头像' }).click();
  await page.getByLabel('选择头像图片').setInputFiles({ name: 'bad.svg', mimeType: 'image/svg+xml', buffer: invalidSvg() });
  await expect(page.getByRole('alert')).toContainText('请选择 JPEG、PNG 或 WebP');
  expect(avatarUploads).toBe(1);
  await page.getByLabel('选择头像图片').setInputFiles({ name: 'bad.png', mimeType: 'image/png', buffer: corruptPng() });
  await expect(page.getByRole('alert')).toContainText('无法读取这张图片');
  expect(avatarUploads).toBe(1);
  await page.getByRole('button', { name: '取消' }).click();
  const profileAfterInvalid = await page.request.get('/api/v2/auth/me');
  expect((await profileAfterInvalid.json() as { avatarUrl: string | null; profileVersion: number }).avatarUrl).toBe(uploadBody.avatarUrl);

  await page.getByRole('button', { name: '修改密码' }).click();
  await page.getByLabel('当前密码').fill('definitely-wrong-password');
  await page.getByLabel('新密码', { exact: true }).fill(changedPassword);
  await page.getByLabel('确认新密码', { exact: true }).fill(changedPassword);
  await page.getByRole('button', { name: '保存新密码' }).click();
  await expect(page.getByRole('alert')).toContainText('当前密码不正确，请重试。');
  await page.getByRole('button', { name: '关闭' }).click();

  const oldContext = await browser.newContext();
  const oldPage = await oldContext.newPage();
  await openAuth(oldPage);
  await login(oldPage, account.username, account.password);
  expect((await oldPage.request.get('/api/v2/auth/me')).status()).toBe(200);

  await page.getByRole('button', { name: '修改密码' }).click();
  await page.getByLabel('当前密码').fill(account.password);
  await page.getByLabel('新密码', { exact: true }).fill(changedPassword);
  await page.getByLabel('确认新密码', { exact: true }).fill(changedPassword);
  await page.getByRole('button', { name: '保存新密码' }).click();
  await expect(page.getByRole('status')).toContainText('密码已更新，所有旧会话已撤销');
  await page.getByRole('button', { name: '返回登录' }).click();
  await expect(page.getByRole('heading', { name: '欢迎入席' })).toBeVisible();
  expect((await page.request.get('/api/v2/auth/me')).status()).toBe(401);
  expect((await oldPage.request.get('/api/v2/auth/me')).status()).toBe(401);
  await oldContext.close();
  await page.screenshot({ path: `/results/login-after-change-${testInfo.project.name}.png` });
  await login(page, account.username, changedPassword);
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page.getByRole('heading', { name: '欢迎入席' })).toBeVisible();
  await page.screenshot({ path: `/results/login-after-logout-${testInfo.project.name}.png` });
  await expectNoHorizontalOverflow(page);
});

test('维护者重置码 UI 重置预建账号并重新登录', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const account = loadAccountCase(testInfo.project.name).reset;
  await openAuth(page);
  await page.getByRole('button', { name: '已有密码重置码' }).click();
  await page.getByLabel('密码重置码').fill(account.token);
  await page.getByLabel('设置新密码', { exact: true }).fill(account.password);
  await page.getByLabel('确认密码', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: /保存新密码/ }).click();
  await expect(page.getByRole('status')).toContainText('密码已重置，请使用新密码登录');
  await login(page, account.username, account.password);
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page.getByRole('heading', { name: '欢迎入席' })).toBeVisible();
});

test('注册响应丢失后转登录恢复，且不重复注册', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const account = loadAccountCase(testInfo.project.name).lost;
  let registerAttempts = 0;
  await page.route('**/api/v2/auth/register', async route => {
    registerAttempts += 1;
    await route.fetch();
    await route.abort('failed');
  });

  await openAuth(page);
  await submitRegistration(page, account);
  await expect(page.getByRole('heading', { name: '欢迎入席' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('尚未确认注册结果');
  expect(registerAttempts).toBe(1);
  await login(page, account.username, account.password);
  expect(registerAttempts).toBe(1);
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page.getByRole('heading', { name: '欢迎入席' })).toBeVisible();
});
