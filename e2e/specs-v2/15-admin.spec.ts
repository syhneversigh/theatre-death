import { expect, test } from '@playwright/test';
import { loadRoomAccounts, loginRoomAccount } from '../helpers-v2/rooms.ts';
import { adminCredentials, ensureAdmin, openAdmin, loginAdmin } from '../helpers-v2/admin.ts';
import { staticPng } from '../helpers-v2/account.ts';

test.describe.configure({ mode: 'serial' });

test('未配置 ADMIN_PASSWORD 时只显示说明且没有网页设置入口', async ({ page }) => {
  await page.route('**/api/v2/admin/me', async route => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'admin_not_configured' } }) }));
  await openAdmin(page);
  await expect(page.getByText('管理员功能尚未配置')).toBeVisible();
  await expect(page.getByText('ADMIN_PASSWORD')).toBeVisible();
  await expect(page.getByLabel('管理员密码')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /保存管理员密码|完成配置|设置管理员/ })).toHaveCount(0);
  await page.unroute('**/api/v2/admin/me');
});

test('管理员生成一次性注册邀请并治理账户，普通玩家无管理链接或数据', async ({ page, browser }, testInfo) => {
  await ensureAdmin(page, adminCredentials());
  await page.getByRole('button', { name: '邀请码' }).click();
  await page.getByLabel('有效期（分钟）').fill('15');
  await page.getByRole('button', { name: '生成注册邀请码' }).click();
  const secret = page.getByLabel('一次性密钥'); await expect(secret).toBeVisible();
  const token = await secret.inputValue(); expect(token.length).toBeGreaterThan(10);
  await page.getByRole('button', { name: '我已保存' }).click();
  const account = `adm_${testInfo.project.name.slice(0, 4)}_${Date.now().toString().slice(-8)}`;
  const playerPassword = `Player-${Date.now()}-password`;
  const registered = await page.request.post('/api/v2/auth/register', { data: { username: account, password: playerPassword, invitation: token }, headers: { Origin: new URL(page.url()).origin } });
  expect(registered.status()).toBe(201);
  await expect.poll(async () => {
    const response = await page.request.get(`/api/v2/admin/accounts?query=${encodeURIComponent(account)}&status=all&page=1&pageSize=25`);
    if (response.status() !== 200) return false;
    const body = await response.json() as { items?: unknown[] };
    return (body.items?.length ?? 0) > 0;
  }, { timeout: 10_000, intervals: [250] }).toBe(true);
  await page.getByRole('button', { name: '账户' }).click();
  await page.getByLabel('搜索账号').fill(account); await page.getByRole('button', { name: '搜索' }).click();
  const card = page.locator('.admin-account').filter({ hasText: account }).first(); await expect(card).toBeVisible();
  await expect(page.getByText(playerPassword)).toHaveCount(0);
  await expect(page.getByText(/password_hash|token_hash|管理员密码/)).toHaveCount(0);
  const renamedName = `${account}_r`;
  await card.getByRole('button', { name: '改名' }).click(); await page.getByLabel('新账号名').fill(renamedName); await page.getByRole('button', { name: '保存' }).click();
  await page.getByLabel('搜索账号').fill(renamedName); await page.getByRole('button', { name: '搜索' }).click();
  const renamed = page.locator('.admin-account').filter({ hasText: renamedName }).first(); await expect(renamed).toBeVisible();
  await renamed.getByRole('button', { name: '注销会话' }).click(); await page.getByRole('dialog').getByRole('button', { name: '确认操作' }).click();
  await renamed.getByRole('button', { name: '停用账户' }).click(); await page.getByRole('dialog').getByRole('button', { name: '确认操作' }).click(); await expect(renamed).toContainText('已停用');
  await renamed.getByRole('button', { name: '重新启用' }).click(); await page.getByRole('dialog').getByRole('button', { name: '确认操作' }).click(); await expect(renamed).toContainText('可登录');
  await renamed.getByRole('button', { name: '重置码' }).click(); await expect(page.getByRole('dialog', { name: '签发密码重置码？' })).toBeVisible(); await page.getByRole('dialog', { name: '签发密码重置码？' }).getByRole('button', { name: '确认操作' }).click(); await expect(page.getByLabel('一次性密钥')).toBeVisible(); await page.getByRole('button', { name: '我已保存' }).click();
  await page.screenshot({ path: `/results/admin-accounts-${testInfo.project.name}.png`, fullPage: false });
  const playerContext = await browser.newContext(); const playerPage = await playerContext.newPage();
  try { await loginRoomAccount(playerPage, loadRoomAccounts(testInfo.project.name)[6]!); await expect(playerPage.getByRole('button', { name: /管理后台|管理员/ })).toHaveCount(0); await expect(playerPage.getByText(/账户管理|邀请码管理|资源概览/)).toHaveCount(0); }
  finally { await playerContext.close(); }
});

test('管理员头像清除需先存在头像，邀请码可编辑/撤销/重新生成且 unknown 重试原操作', async ({ page, browser }, testInfo) => {
  await ensureAdmin(page, adminCredentials());
  const player = loadRoomAccounts(testInfo.project.name)[6]!;
  const playerContext = await browser.newContext(); const playerPage = await playerContext.newPage();
  try { await loginRoomAccount(playerPage, player); await playerPage.getByRole('button', { name: '我的账户' }).click(); await playerPage.getByRole('button', { name: '更换头像' }).click(); await playerPage.getByLabel('选择头像图片').setInputFiles({ name: 'admin-clear.png', mimeType: 'image/png', buffer: staticPng() }); await expect(playerPage.getByRole('img', { name: '裁剪后的头像预览' })).toBeVisible(); await playerPage.getByRole('button', { name: '保存头像' }).click(); await expect(playerPage.getByRole('dialog')).toHaveCount(0); }
  finally { await playerContext.close(); }
  await page.getByRole('button', { name: '账户' }).click(); await page.getByLabel('搜索账号').fill(player.username); await page.getByRole('button', { name: '搜索' }).click();
  const card = page.locator('.admin-account').filter({ hasText: player.username }).first(); await expect(card.getByRole('button', { name: '清除头像' })).toBeEnabled(); await card.getByRole('button', { name: '清除头像' }).click(); await page.getByRole('dialog').getByRole('button', { name: '确认操作' }).click(); await expect(card.getByRole('button', { name: '清除头像' })).toBeDisabled();
  await page.getByRole('button', { name: '邀请码' }).click(); await page.getByLabel('有效期（分钟）').fill('15'); await page.getByRole('button', { name: '生成注册邀请码' }).click(); await page.getByRole('button', { name: '我已保存' }).click();
  const row = page.locator('.admin-table-wrap tbody tr').first(); await row.getByRole('button', { name: '改到期时间' }).click(); const expiry = new Date(Date.now() + 15 * 60_000 - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16); await page.getByLabel('新的到期时间').fill(expiry); await page.getByRole('button', { name: '保存' }).click(); await row.getByRole('button', { name: '撤销' }).click(); await page.getByRole('dialog').getByRole('button', { name: '确认操作' }).click(); await expect(row).toContainText('已撤销');
  const paginationBefore = await page.locator('.pagination').innerText();
  const totalBefore = Number(paginationBefore.match(/共 (\d+) 项/)?.[1] ?? 0);
  const bodies: unknown[] = []; let attempts = 0; await page.route('**/api/v2/admin/invitations/*/regenerate', async route => { bodies.push(route.request().postDataJSON()); attempts += 1; if (attempts === 1) { const response = await route.fetch(); await route.abort('failed'); void response; return; } await route.continue(); });
  await row.getByRole('button', { name: '重新生成' }).click(); await expect(page.getByText('尚未确认结果')).toBeVisible(); await page.getByRole('button', { name: '重试原操作' }).click(); await expect.poll(() => bodies.length).toBe(2); expect(bodies[1]).toEqual(bodies[0]); await expect(page.getByLabel('一次性密钥')).toBeVisible(); await expect.poll(async () => (await page.locator('.pagination').innerText()).includes(`共 ${totalBefore + 1} 项`)).toBe(true); await page.getByRole('button', { name: '我已保存' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const firstCells = page.locator('.admin-table-wrap tbody tr').first().locator('td');
  const cellWidths = await firstCells.evaluateAll(cells => cells.map(cell => cell.getBoundingClientRect().width));
  if (testInfo.project.name === 'webkit') for (const width of cellWidths) expect(width).toBeGreaterThan(200);
  const operationButtons = page.locator('.admin-table-wrap tbody tr').first().locator('td').last().getByRole('button');
  const buttonWidths = await operationButtons.evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().width));
  if (testInfo.project.name === 'webkit') for (const width of buttonWidths) expect(width).toBeGreaterThan(48);
  if (testInfo.project.name === 'chromium') await expect(page.locator('.admin-table-wrap thead')).toBeVisible();
  await page.screenshot({ path: `/results/admin-invitations-${testInfo.project.name}.png`, fullPage: false });
});
