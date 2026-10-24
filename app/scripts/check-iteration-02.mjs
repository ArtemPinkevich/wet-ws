import assert from 'node:assert/strict';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium, _electron } from 'playwright';
import { WebSocket, WebSocketServer } from 'ws';
import { startService } from '../dist/runtime/service.js';

const checks = resolve(process.env.CHECKS_DIR ?? 'out/checks/iteration-02');
const service = await startService({ host: '0.0.0.0', port: 0 });
const upstream = new WebSocketServer({ host: '0.0.0.0', port: 0 });
await once(upstream, 'listening');
upstream.on('connection', (socket) =>
  socket.on('message', (data, binary) => socket.send(data, { binary })),
);
let browser, external, desktop, page;
try {
  browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL ?? 'msedge',
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const desktopMode = process.argv.includes('desktop');
  if (desktopMode)
    desktop = await _electron.launch({
      executablePath:
        process.env.DESKTOP_EXE ??
        (() => {
          throw new Error(
            'Set DESKTOP_EXE to an executable extracted from the ZIP under out/build',
          );
        })(),
    });
  page = desktopMode ? await desktop.firstWindow() : await context.newPage();
  const second = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  if (!desktopMode)
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
  if (!desktopMode) await page.goto(process.env.DELIVERY_URL ?? service.url);
  else await page.waitForURL(/^http:\/\//);
  const uiUrl = page.url();
  await page
    .locator('#control-state')
    .filter({ hasText: 'синхронизирован' })
    .waitFor();
  await page.locator('#settings-toggle').click();
  await page
    .locator('#host')
    .fill(process.env.DELIVERY_URL ? '0.0.0.0' : '127.0.0.1');
  await page
    .locator('#port')
    .fill(
      process.env.DELIVERY_URL
        ? (process.env.DELIVERY_CLIENT_PORT ?? '8081')
        : '0',
    );
  await page
    .locator('#url')
    .fill(
      `ws://${process.env.DELIVERY_URL ? 'host.docker.internal' : '127.0.0.1'}:${upstream.address().port}`,
    );
  await page.locator('#server-action').click();
  await page
    .locator('#server-state')
    .filter({ hasText: /^Сервер · Подключён$/ })
    .waitFor();
  await page.locator('#client-action').click();
  await page.locator('#client-address').filter({ hasText: 'ws://' }).waitFor();
  external = new WebSocket(await page.locator('#client-address').textContent());
  await once(external, 'open');
  await second.goto(uiUrl);
  await second
    .locator('#client-state')
    .filter({ hasText: /^Клиент · Подключён$/ })
    .waitFor();
  const text = '<b>Это текст</b> 🙂\nвторая строка';
  const reply = once(external, 'message');
  external.send(text);
  assert.equal((await reply)[0].toString(), text);
  for (const tab of [page, second]) {
    await tab.waitForFunction(
      (value) =>
        [...document.querySelectorAll('#chat pre')].filter(
          (el) => el.textContent === value,
        ).length === 2,
      text,
    );
    assert.equal(await tab.locator('#chat b').count(), 0);
    assert.equal(await tab.locator('#protocol').getAttribute('readonly'), '');
  }
  const splitter = page.locator('#library-split');
  const width = Number(await splitter.getAttribute('aria-valuenow'));
  await splitter.focus();
  await splitter.press('ArrowRight');
  assert.equal(
    Number(await splitter.getAttribute('aria-valuenow')),
    width + 16,
  );
  const longText = Array.from(
    { length: 12 },
    (_, i) => `длинная строка ${i}`,
  ).join('\n');
  const longReply = once(external, 'message');
  external.send(longText);
  await longReply;
  const expand = page
    .locator('article.client')
    .filter({ hasText: 'длинная строка 0' })
    .locator('[data-expand]');
  await expand.focus();
  await expand.press('Enter');
  await page.locator('article.client.expanded pre').waitFor();
  assert.equal(
    await page.evaluate(() =>
      document.activeElement.getAttribute('aria-label'),
    ),
    'Свернуть сообщение',
  );
  await page.reload();
  await page.waitForFunction(
    (value) =>
      [...document.querySelectorAll('#chat pre')].filter(
        (el) => el.textContent === value,
      ).length === 2,
    text,
  );
  if (!desktopMode) {
    await page.evaluate(() => window.testControlSockets.at(-1).close());
    await page
      .locator('#control-state')
      .filter({ hasText: 'потеряна' })
      .waitFor();
    await page
      .locator('#control-state')
      .filter({ hasText: 'синхронизирован' })
      .waitFor();
    assert.equal(
      await page.locator('#client-state').textContent(),
      'Клиент · Подключён',
    );
  }
  await second.locator('#clear').click();
  await page.waitForFunction(
    () => document.querySelectorAll('#chat article').length === 0,
  );
  const after = once(external, 'message');
  external.send('после очистки');
  assert.equal((await after)[0].toString(), 'после очистки');
  await page.waitForFunction(
    () => document.querySelectorAll('#chat article.client').length === 1,
  );
  await mkdir(checks, { recursive: true });
  await page.screenshot({
    path: resolve(checks, 'wide.png'),
    fullPage: true,
  });
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
  await second.locator('#settings-toggle').click();
  await second.locator('#server-action').click();
  await page
    .locator('#server-state')
    .filter({ hasText: /^Сервер · Не подключён$/ })
    .waitFor();
  assert.equal(
    await page.locator('#client-state').textContent(),
    'Клиент · Подключён',
  );
  assert.deepEqual(errors, []);
  console.log(
    `PASS: ${desktopMode ? 'packaged Electron' : 'browser'} echo, literal text, two interfaces, reload, shared clear, independent disconnect, narrow viewport.`,
  );
  console.log(
    `Delivery: ${desktopMode ? (process.env.DESKTOP_EXE ?? 'default packaged executable') : (process.env.DELIVERY_URL ?? 'source service')}`,
  );
  console.log(
    'Not tested: second physical LAN machine. Other deliveries require their own run.',
  );
} catch (error) {
  if (page && !page.isClosed())
    console.error(
      'UI failure state:',
      await page
        .locator('body')
        .innerText()
        .catch(() => 'unavailable'),
    );
  throw error;
} finally {
  external?.terminate();
  await browser?.close();
  await desktop?.close();
  await service.close();
  for (const socket of upstream.clients) socket.terminate();
  await new Promise((resolve) => upstream.close(resolve));
}
