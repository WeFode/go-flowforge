// Captures the running ERP example for the documentation and checks its completion contract.
const { chromium } = require(process.env.FLOWFORGE_PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const root = path.resolve(__dirname, '..');
  const env = fs.readFileSync(path.join(root, '.env'), 'utf8');
  const token = process.env.FLOWFORGE_API_TOKEN || env.match(/^FLOWFORGE_API_TOKEN=(.+)$/m)?.[1].trim();
  assert.ok(token, 'a local API token is required');
  const output = path.join(root, 'docs', 'screenshots'); fs.mkdirSync(output, { recursive: true });
  const base = process.env.FLOWFORGE_UI_URL || 'http://127.0.0.1:8088';
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1300 }, deviceScaleFactor: 1 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(base);
    await page.getByPlaceholder('输入访问令牌').fill(token);
    await page.getByRole('button', { name: '连接工作空间' }).click();
    await page.getByRole('heading', { name: '工作流', exact: true }).waitFor();
    await page.getByRole('button', { name: '工厂 ERP · 订单到排产', exact: true }).click();
    await page.getByRole('button', { name: /产能评估智能体/ }).click();
    assert.equal(await page.getByLabel('执行模式').inputValue(), 'async');
    await page.getByRole('button', { name: '适应画布' }).click();
    assert.equal(await page.locator('.execution-mode').count(), 8);
    await page.locator('.designer').screenshot({ path: path.join(output, 'erp-workflow.png') });
    await page.getByRole('button', { name: '运行', exact: true }).click();
    const input = JSON.parse(await page.getByLabel('输入数据（JSON）').inputValue());
    assert.equal(input.order_id, 'SO-2026-1042');
    await page.getByRole('button', { name: '开始执行' }).click();
    const drawer = page.getByRole('dialog', { name: '执行详情' }); await drawer.waitFor();
    await page.waitForFunction(() => document.querySelectorAll('.run-drawer .flow-node.waiting_callback').length >= 2, null, { timeout: 15000 });
    await drawer.getByRole('button', { name: /产能评估智能体/ }).click();
    await drawer.locator('.graph-stage').screenshot({ path: path.join(output, 'erp-async.png') });
    await page.locator('.run-summary .badge.succeeded').waitFor({ timeout: 45000 });
    await drawer.getByRole('button', { name: /回写 ERP 工单/ }).click();
    assert.match(await page.locator('.output-panel pre').innerText(), /WO-SO-2026-1042/);
    await page.setViewportSize({ width: 1500, height: 1000 });
    await drawer.evaluate(element => {
      const panel = element.querySelector('.output-panel');
      element.scrollTop += panel.getBoundingClientRect().top - element.getBoundingClientRect().top - 24;
    });
    await drawer.screenshot({ path: path.join(output, 'erp-result.png') });
    const response = await page.request.get(base + '/api/v1/runs?workflow_id=factory-erp&limit=1', { headers: { Authorization: 'Bearer ' + token } });
    assert.equal(response.status(), 200); const [run] = await response.json();
    assert.equal(run.status, 'succeeded'); assert.equal(run.steps.inventory.attempts, 2);
    for (const id of ['capacity', 'procurement', 'notify']) { assert.equal(run.steps[id].status, 'succeeded'); assert.equal(run.definition.steps.find(s => s.id === id).execution_mode, 'async'); }
    assert.deepEqual(errors, []);
    console.log('ERP browser checks passed. Captured the workflow, asynchronous execution and ERP work-order result.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
