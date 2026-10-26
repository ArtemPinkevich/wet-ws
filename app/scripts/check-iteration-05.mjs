import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, _electron } from 'playwright';
import { startService } from '../dist/runtime/service.js';

const directory = resolve('out/checks/iteration-05');
await mkdir(directory, { recursive: true });
const service = await startService({ host: '127.0.0.1', port: 0 });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({
  viewport: { width: 1600, height: 960 },
});
const desktopMode = process.argv.includes('desktop');
let desktop;
let desktopWindow;
const report = {
  mode: desktopMode ? 'electron-source' : 'browser-source',
  criteria: [],
  errors: [],
  untested: [
    'packaged ZIP/Docker',
    'physical touch device',
    'cross-origin desktop persistence',
  ],
};
try {
  let page;
  if (desktopMode) {
    desktop = await _electron.launch({ args: ['.'] });
    page = await desktop.firstWindow();
    desktopWindow = await desktop.browserWindow(page);
    await page.waitForURL(/^http:\/\//);
    await desktop.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1600, 960),
    );
  } else {
    page = await context.newPage();
    await page.goto(service.url);
  }
  page.on('pageerror', (error) => report.errors.push(error.message));
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(10000);
  const url = page.url();
  let second;
  if (desktopMode) {
    [second] = await Promise.all([
      desktop.waitForEvent('window'),
      desktop.evaluate(async ({ BrowserWindow }, url) => {
        const window = new BrowserWindow({
          show: false,
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        });
        await window.loadURL(url);
      }, url),
    ]);
  } else {
    second = await context.newPage();
    await second.goto(url);
  }
  await page.bringToFront();
  const records = [
    { id: 'a', name: 'Same name', text: 'first\r\nsecond\rthird\n' },
    { id: 'b', name: 'Same name', text: '<b>literal</b>' },
    { id: 'c', name: 'Third', text: 'third' },
  ];
  const seed = async (items) => {
    await second.evaluate(
      (items) =>
        localStorage.setItem(
          'wet-ws.templates.v1',
          JSON.stringify({ version: 1, items }),
        ),
      items,
    );
    await page.waitForFunction(
      (count) => document.querySelectorAll('[data-template]').length === count,
      items.length,
    );
  };
  const ids = () =>
    page
      .locator('[data-template]')
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.template));
  const stored = () =>
    page.evaluate(
      () => JSON.parse(localStorage.getItem('wet-ws.templates.v1')).items,
    );
  const waitIds = (order) =>
    page.waitForFunction(
      (expected) =>
        JSON.stringify(
          [...document.querySelectorAll('[data-template]')].map(
            (node) => node.dataset.template,
          ),
        ) === JSON.stringify(expected),
      order,
    );
  const grip = (id) => page.locator(`[data-drag-handle="${id}"]`);
  const trash = (id) => page.locator(`[data-delete="${id}"]`);
  const dragTo = async (id, anchor, after = true, release = true) => {
    const from = await grip(id).boundingBox();
    const to = await page
      .locator(`[data-template-id="${anchor}"]`)
      .boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      to.x + to.width / 2,
      to.y + (after ? to.height - 8 : 8),
      { steps: 8 },
    );
    if (release) await page.mouse.up();
  };
  await seed(records);
  await page.locator('[data-template="a"]').click();
  await page.locator('#message-text').press('End');
  await page.locator('#message-text').press('x');
  await page.locator('#message-target').selectOption('client');
  const draft = await page.locator('#message-text').inputValue();
  await grip('a').press('ArrowDown');
  await waitIds(['b', 'a', 'c']);
  assert.equal(
    await grip('a').evaluate((node) => node === document.activeElement),
    true,
  );
  assert.deepEqual(
    (await stored()).find((item) => item.id === 'a'),
    records[0],
  );
  await dragTo('a', 'c');
  await waitIds(['b', 'c', 'a']);
  await dragTo('a', 'b', false, false);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  assert.deepEqual(await ids(), ['b', 'c', 'a']);
  await dragTo('a', 'b', false, false);
  await page.mouse.move(1500, 50);
  await page.mouse.up();
  assert.deepEqual(await ids(), ['b', 'c', 'a']);
  await trash('a').click();
  assert.equal(await page.locator('#delete-name').textContent(), 'Same name');
  await page.keyboard.press('Escape');
  assert.equal(
    await trash('a').evaluate((node) => node === document.activeElement),
    true,
  );
  await trash('a').click();
  await page.locator('#delete-confirm').click();
  await waitIds(['b', 'c']);
  assert.equal(await page.locator('#message-text').inputValue(), draft);
  assert.equal(await page.locator('#message-target').inputValue(), 'client');
  assert.match(await page.locator('#editor-mode').textContent(), /изменён/);
  assert.equal(await page.locator('.template-item.active').count(), 0);
  await page.locator('#save-toggle').click();
  await page.locator('#template-name').fill('Retained copy');
  await page.locator('#save-template').click();
  const copy = (await stored()).at(-1);
  assert.notEqual(copy.id, 'a');
  assert.ok(copy.text.includes('\r\n') && copy.text.includes('\rthird'));
  report.criteria.push(
    'keyboard and pointer reorder; Escape/outside cancel; confirmed ID deletion; focus; independent dirty CR/CRLF copy and target; saving creates a new ID',
  );

  await seed(records);
  await waitIds(['a', 'b', 'c']);
  await trash('a').click();
  await seed(records.slice(1));
  await page.locator('#delete-confirm').click();
  assert.deepEqual(await ids(), ['b', 'c']);
  await dragTo('b', 'c', true, false);
  await seed([records[2]]);
  await page.mouse.up();
  assert.deepEqual(await ids(), ['c']);
  await trash('c').click();
  await page.evaluate(() => {
    window.originalSet = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('QuotaExceededError');
    };
  });
  await page.locator('#delete-confirm').click();
  assert.match(await page.locator('#delete-error').textContent(), /Quota/);
  assert.equal((await stored()).length, 1);
  await page.evaluate(() => {
    Storage.prototype.setItem = window.originalSet;
  });
  await page.locator('#delete-confirm').click();
  assert.equal(
    await page
      .locator('#library-empty')
      .evaluate((node) => node === document.activeElement),
    true,
  );
  report.criteria.push(
    'real storage events: stale confirmation and active drag cancellation; quota failure leaves modal/data intact; last delete focuses empty action',
  );

  await seed(
    Array.from({ length: 20 }, (_, i) => ({
      id: String(i),
      name: 'Template ' + i,
      text: 'text ' + i,
    })),
  );
  assert.equal(await page.locator('#save-toggle').isDisabled(), true);
  await trash('0').click();
  await page.locator('#delete-confirm').click();
  assert.equal(await page.locator('#save-toggle').isDisabled(), false);
  await page.reload();
  await waitIds(Array.from({ length: 19 }, (_, i) => String(i + 1)));
  await grip('1').focus();
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowDown');
  const focusedBounds = await grip('1').boundingBox();
  const listBounds = await page.locator('#template-list').boundingBox();
  assert.ok(
    focusedBounds.y >= listBounds.y &&
      focusedBounds.y + focusedBounds.height <=
        listBounds.y + listBounds.height,
  );
  assert.equal(
    await grip('1').evaluate((node) => node === document.activeElement),
    true,
  );
  const reordered = await ids();
  assert.equal(reordered[12], '1');
  await page.reload();
  await waitIds(reordered);
  report.criteria.push(
    'long library: twelve keyboard moves retain visible focus and persist after reload',
  );
  await page.screenshot({
    path: resolve(directory, report.mode + '-wide.png'),
  });
  await seed(records);
  for (const width of [700, 390]) {
    if (desktopMode)
      await desktopWindow.evaluate(
        (window, width) => window.setSize(width, 844),
        width,
      );
    else await page.setViewportSize({ width, height: 844 });
    await page.locator('[data-mobile="library"]').click();
    await seed(records);
    await waitIds(['a', 'b', 'c']);
    await dragTo('a', 'b');
    await waitIds(['b', 'a', 'c']);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: resolve(directory, report.mode + `-${width}.png`),
    });
  }
  await second.evaluate(() => localStorage.setItem('wet-ws.templates.v1', '{'));
  await page.waitForFunction(
    () => document.querySelector('[data-delete]').disabled,
  );
  assert.match(await page.locator('#library-note').textContent(), /недоступна/);
  assert.equal(
    await page.evaluate(() => localStorage.getItem('wet-ws.templates.v1')),
    '{',
  );
  report.criteria.push(
    '20-item capacity released; reload persists order; 700px two-column and 390px pointer reorder; corruption disables controls without overwriting',
  );
  assert.deepEqual(report.errors, []);
  report.result = 'PASS';
} catch (error) {
  console.error(error);
  throw error;
} finally {
  report.result ??= 'FAIL';
  await writeFile(
    resolve(directory, report.mode + '.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  await desktop?.close();
  await browser.close();
  await service.close();
}
console.log(JSON.stringify(report, null, 2));
