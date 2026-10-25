// Optional browser verification. Supply FLOWFORGE_PLAYWRIGHT_PATH when Playwright is not on Node's module path.
const { chromium } = require(process.env.FLOWFORGE_PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const root = path.resolve(__dirname, '..');
  const env = fs.readFileSync(path.join(root, '.env'), 'utf8');
  const token = env.match(/^FLOWFORGE_API_TOKEN=(.+)$/m)?.[1].trim();
  assert.ok(token, 'local .env must contain a token');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  const createdIDs = [];
  page.on('pageerror', error => errors.push(error.message));
  const base = process.env.FLOWFORGE_UI_URL || 'http://127.0.0.1:8088';
  const output = path.join(root, 'test-results');
  fs.mkdirSync(output, { recursive: true });
  try {
    await page.goto(base);
    await page.getByPlaceholder('输入访问令牌').fill(token);
    await page.getByRole('button', { name: '连接工作空间' }).click();
    await page.getByRole('heading', { name: '工作流', exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'workflows.png'), fullPage: true });
    await page.getByRole('button', { name: 'AI 内容处理流水线' }).click();
    await page.getByRole('button', { name: '流程设置', exact: true }).first().click();
    assert.equal(await page.getByLabel('名称', { exact: true }).inputValue(), 'AI 内容处理流水线');
    await page.screenshot({ path: path.join(output, 'designer.png'), fullPage: true });
    await page.getByRole('button', { name: '运行', exact: true }).click();
    await page.getByRole('button', { name: '开始执行' }).click();
    await page.getByRole('dialog', { name: '执行详情' }).waitFor();
    await page.locator('.run-summary .badge.succeeded').waitFor({ timeout: 15000 });
    await page.getByRole('dialog', { name: '执行详情' }).getByRole('button', { name: '合并结果' }).click();
    assert.match(await page.locator('.output-panel pre').innerText(), /工作流执行完成/);
    await page.screenshot({ path: path.join(output, 'execution.png'), fullPage: true });
    await page.getByRole('button', { name: '关闭执行详情' }).click();
    await page.getByRole('button', { name: '返回工作流列表' }).click();
    await page.getByRole('button', { name: '新建工作流', exact: true }).click();
    await page.getByLabel('步骤名称', { exact: true }).fill('UI 测试步骤');
    const value = page.getByLabel('输出映射', { exact: false });
    await value.fill('{"ui_test": true}');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.getByText('工作流已保存，后续实例使用新版本').waitFor();
    // A successful save must contain the last field edit even when Save is clicked while it has focus.
    await page.getByRole('button', { name: 'JSON', exact: true }).click();
    const savedJSON = await page.getByLabel('工作流 JSON').inputValue();
    assert.match(savedJSON, /"ui_test": true/);
    createdIDs.push(JSON.parse(savedJSON).id);
    await page.getByRole('button', { name: '可视化', exact: true }).click();
    await value.fill('{invalid json');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.getByRole('alert').getByText('请先修正步骤配置中的 JSON').waitFor();
    await value.fill('{"ui_test": true}');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.getByText('工作流已保存，后续实例使用新版本').waitFor();
    await page.getByRole('button', { name: '返回工作流列表' }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true });
    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflows, false, 'mobile layout must not overflow');
    assert.deepEqual(errors, [], 'browser must not have uncaught errors');
    console.log('UI smoke passed: login, designer, live execution, field-save, JSON validation, mobile layout.');
  } finally {
    for (const id of createdIDs) await fetch(base + '/api/v1/workflows/' + id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
    await browser.close();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
