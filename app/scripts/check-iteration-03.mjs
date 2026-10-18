import assert from 'node:assert/strict';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, _electron } from 'playwright';
import { WebSocket, WebSocketServer } from 'ws';
import { startService } from '../dist/runtime/service.js';

const checks = resolve(process.env.CHECKS_DIR ?? 'out/checks/iteration-03');
const service = await startService({ host: '127.0.0.1', port: 0 });
const upstream = new WebSocketServer({ host: '127.0.0.1', port: 0 });
await once(upstream, 'listening');
const received = [];
let peer, browser, desktop, external, page;
upstream.on('connection', (socket) => {
  peer = socket;
  socket.on('message', (data, binary) => {
    received.push(data.toString());
    socket.send(data, { binary });
  });
});
const report = {
  node: process.version,
  mode: process.argv.includes('desktop') ? 'electron-source' : 'browser-source',
  criteria: [],
  untested: [
    'packaged ZIP',
    'Docker artifact',
    'second physical LAN machine',
    'load/backpressure',
  ],
};
try {
  browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL ?? 'msedge',
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  if (process.argv.includes('desktop')) {
    desktop = await _electron.launch({ args: ['.'] });
    page = await desktop.firstWindow();
    await page.waitForURL(/^http:\/\//);
  } else page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  if (!desktop) {
    await page.addInitScript(() => {
      const Native = window.WebSocket;
      window.testControlSockets = [];
      window.WebSocket = class extends Native {
        constructor(...args) {
          super(...args);
          window.testControlSockets.push(this);
        }
      };
    });
    await page.goto(service.url);
  }
  const uiUrl = page.url();
  await page
    .locator('#control-state')
    .filter({ hasText: 'синхронизирован' })
    .waitFor();
  const second = await context.newPage();
  await second.goto(uiUrl);
  const draft = '🙂 <b>literal</b>\n  тестовый текст  ';
  await page.locator('#message-text').fill(draft);
  assert.equal(await page.locator('#send-message').isDisabled(), true);
  await page.locator('#host').fill('127.0.0.1');
  await page.locator('#port').fill('0');
  await page.locator('#url').fill(`ws://127.0.0.1:${upstream.address().port}`);
  await page.locator('#server-action').click();
  await page
    .locator('#server-state')
    .filter({ hasText: /^Подключён$/ })
    .waitFor();
  // Manual send needs only its selected recipient, before a real client exists.
  await page.locator('#send-message').click();
  await page.waitForFunction(
    (value) =>
      [...document.querySelectorAll('#chat article')].some(
        (e) =>
          e.textContent.includes('Создано вручную → Сервер') &&
          e.querySelector('pre').textContent === value,
      ),
    draft,
  );
  assert.equal(received[0], draft);
  assert.equal(await page.locator('#message-text').inputValue(), draft);
  assert.equal(await page.locator('#chat b').count(), 0);
  report.criteria.push(
    'AC-2 literal manual send to server without client; draft retained',
  );
  await page.locator('#client-action').click();
  await page.locator('#client-address').filter({ hasText: 'ws://' }).waitFor();
  external = new WebSocket(await page.locator('#client-address').textContent());
  const clientReceived = [];
  external.on('message', (data) => clientReceived.push(data.toString()));
  await once(external, 'open');
  await page
    .locator('#client-state')
    .filter({ hasText: /^Подключён$/ })
    .waitFor();
  await page.locator('#auto-forward').click();
  await second.waitForFunction(
    () => !document.querySelector('#auto-forward').checked,
  );
  external.send('paused-client');
  peer.send('paused-server');
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('#chat pre')].filter((e) =>
        e.textContent.startsWith('paused-'),
      ).length === 2,
  );
  assert.equal(received.includes('paused-client'), false);
  assert.equal(clientReceived.includes('paused-server'), false);
  await page.locator('#message-target').selectOption('client');
  const incoming = once(external, 'message');
  await page.locator('#send-message').click();
  assert.equal((await incoming)[0].toString(), draft);
  await second.waitForFunction(
    (value) =>
      [...document.querySelectorAll('#chat article')].some(
        (e) =>
          e.textContent.includes('Создано вручную → Клиент') &&
          e.querySelector('pre').textContent === value,
      ),
    draft,
  );
  report.criteria.push(
    'AC-1 OFF preserves bidirectional observations; AC-2 manual to client with OFF and shared history',
  );
  // The global OFF survives a new snapshot; local drafts are independent.
  await second.reload();
  await second
    .locator('#control-state')
    .filter({ hasText: 'синхронизирован' })
    .waitFor();
  assert.equal(await second.locator('#auto-forward').isChecked(), false);
  assert.equal(await second.locator('#message-text').inputValue(), '');
  await second.locator('#auto-forward').click();
  await page.waitForFunction(
    () => document.querySelector('#auto-forward').checked,
  );
  assert.equal(received.includes('paused-client'), false);
  assert.equal(clientReceived.includes('paused-server'), false);
  const live = once(external, 'message');
  external.send('live-after-toggle');
  assert.equal((await live)[0].toString(), 'live-after-toggle');
  await page.locator('#message-target').selectOption('server');
  await page.locator('#message-text').fill('injected-live');
  await page.locator('#send-message').click();
  await page.waitForFunction(() =>
    [...document.querySelectorAll('#chat pre')].some(
      (e) => e.textContent === 'injected-live',
    ),
  );
  await page.waitForFunction(
    () => !document.querySelector('#send-message').disabled,
  );
  // Empty payload is allowed; Enter creates a line, never submits.
  await page.locator('#message-text').fill('');
  await page.locator('#send-message').click();
  await page.waitForFunction(
    () => !document.querySelector('#send-message').disabled,
  );
  assert.ok(received.includes(''));
  await page.locator('#message-text').fill('local draft');
  await page.locator('#message-text').press('End');
  await page.locator('#message-text').press('Enter');
  const retained = await page.locator('#message-text').inputValue();
  await page.locator('#message-text').focus();
  external.send('focus-stable');
  await page.waitForFunction(() =>
    [...document.querySelectorAll('#chat pre')].some(
      (e) => e.textContent === 'focus-stable',
    ),
  );
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    'message-text',
  );
  assert.equal(await page.locator('#message-text').inputValue(), retained);
  report.criteria.push(
    'AC-3 live exchange with manual injection; empty text; stable editor focus; Enter newline',
  );
  if (!desktop) {
    const count = received.length;
    await page.evaluate(() => window.testControlSockets.at(-1).close());
    await page
      .locator('#control-state')
      .filter({ hasText: 'потеряна' })
      .waitFor();
    assert.equal(await page.locator('#send-message').isDisabled(), true);
    assert.equal(await page.locator('#auto-forward').isDisabled(), true);
    await page
      .locator('#forward-state')
      .filter({ hasText: 'неизвестно' })
      .waitFor();
    await page
      .locator('#control-state')
      .filter({ hasText: 'синхронизирован' })
      .waitFor();
    assert.equal(await page.locator('#message-text').inputValue(), retained);
    assert.equal(received.length, count);
    report.criteria.push(
      'AC-5 reconnect retains local draft, disables controls, never replays sends',
    );
  }
  await mkdir(checks, { recursive: true });
  await page.screenshot({ path: resolve(checks, 'wide.png'), fullPage: true });
  if (desktop)
    await desktop.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(390, 844),
    );
  else await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: resolve(checks, 'narrow.png'),
    fullPage: true,
  });
  await second.locator('#server-action').click();
  await page
    .locator('#server-state')
    .filter({ hasText: /^Не подключён$/ })
    .waitFor();
  assert.equal(await page.locator('#send-message').isDisabled(), true);
  assert.equal(await page.locator('#message-text').inputValue(), retained);
  report.criteria.push(
    'AC-4 disconnected target blocked; draft retained; narrow layout has no overflow',
  );
  assert.deepEqual(errors, []);
  report.result = 'PASS';
} finally {
  if (report.result !== 'PASS') report.result = 'FAIL';
  await mkdir(checks, { recursive: true });
  await writeFile(
    resolve(checks, 'verification.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  external?.terminate();
  await desktop?.close();
  await browser?.close();
  await service.close();
  for (const socket of upstream.clients) socket.terminate();
  await new Promise((resolve) => upstream.close(resolve));
}
console.log(JSON.stringify(report, null, 2));
