import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, _electron } from 'playwright';
import { WebSocketServer, WebSocket } from 'ws';
import { startService } from '../../dist/runtime/service.js';

const directory = resolve('out/checks/json-editor');
await mkdir(directory, { recursive: true });
const service = await startService({ host: '127.0.0.1', port: 0 });
const upstream = new WebSocketServer({ host: '127.0.0.1', port: 0 });
await once(upstream, 'listening');
const received = [],
  replies = [],
  errors = [];
let peer, external, desktop, browser, page;
upstream.on('connection', (socket) => {
  peer = socket;
  socket.on('message', (data) => received.push(data.toString()));
});
const desktopMode = process.argv.includes('desktop');
const report = {
  mode: desktopMode ? 'electron-source' : 'browser-source',
  criteria: [],
  errors,
  untested: [
    'packaged ZIP/Docker',
    'screen reader audio',
    'physical touch',
    'second physical LAN machine',
  ],
};
try {
  if (desktopMode) {
    desktop = await _electron.launch({ args: ['.'] });
    page = await desktop.firstWindow();
    await page.waitForURL(/^http:\/\//);
    await desktop.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1600, 960),
    );
  } else {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    page = await browser.newPage({ viewport: { width: 1600, height: 960 } });
    await page.goto(service.url);
  }
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('crash', () => errors.push('renderer crashed'));
  const editor = page.locator('#message-text');
  const status = page.locator('#json-status');
  const invalid = () =>
    page.waitForFunction(
      () =>
        document.querySelector('#message-text').getAttribute('aria-invalid') ===
        'true',
    );
  const valid = () =>
    page.waitForFunction(
      () => document.querySelector('#json-status').textContent === 'JSON ✓',
    );
  const raw = '{\r\n  "name": "<b>🙂</b>",\r\n  "x": 1,\r\n}';
  await page.evaluate(
    (raw) =>
      localStorage.setItem(
        'wet-ws.templates.v1',
        JSON.stringify({
          version: 1,
          items: [
            { id: 'raw', name: 'Raw CRLF', text: raw },
            { id: 'plain', name: 'Plain', text: 'ordinary text' },
          ],
        }),
      ),
    raw,
  );
  await page.reload();
  await page.locator('[data-template="raw"]').click();
  await invalid();
  assert.equal(await page.locator('.json-error-line').textContent(), '!4');
  assert.equal(await editor.inputValue(), raw.replace(/\r\n/g, '\n'));
  assert.equal(await page.locator('#highlight b').count(), 0);
  assert.equal(await page.locator('#editor-unsaved').isHidden(), true);
  await status.focus();
  await status.press('Enter');
  assert.equal(await page.locator('#json-details').isVisible(), true);
  await status.press('Tab');
  assert.equal(
    await page
      .locator('#json-details-close')
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.locator('#json-details-close').press('Escape');
  assert.equal(await page.locator('#json-details').isHidden(), true);
  assert.equal(
    await status.evaluate((el) => el === document.activeElement),
    true,
  );
  assert.equal(
    await page
      .locator('[aria-live], [role="status"]')
      .filter({ has: status })
      .count(),
    0,
  );
  report.criteria.push(
    'loaded invalid JSON: exact line marker, escaped payload, clean copy, keyboard details and Escape focus',
  );

  await page.locator('#save-toggle').click();
  await page.locator('#template-name').fill('Invalid copy');
  await page.locator('#save-template').click();
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('wet-ws.templates.v1')).items.at(-1)
          .text,
    ),
    raw,
  );
  await page.locator('#settings-toggle').click();
  await page.locator('#url').fill(`ws://127.0.0.1:${upstream.address().port}`);
  await page.locator('#host').fill('127.0.0.1');
  await page.locator('#port').fill('0');
  await page.locator('#server-action').click();
  await page
    .locator('#server-state')
    .filter({ hasText: 'Сервер · Подключён' })
    .waitFor();
  await page.locator('#client-action').click();
  await page.locator('#client-address').filter({ hasText: 'ws://' }).waitFor();
  external = new WebSocket(await page.locator('#client-address').textContent());
  external.on('message', (data) => replies.push(data.toString()));
  await once(external, 'open');
  await page
    .locator('#client-state')
    .filter({ hasText: 'Клиент · Подключён' })
    .waitFor();
  await page.locator('#settings-close').click();
  await page.locator('#send-message').click();
  for (let i = 0; received.length === 0 && i < 100; i++)
    await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(received[0], raw);
  await page.locator('#message-target').selectOption('client');
  await page.locator('#send-message').click();
  for (let i = 0; replies.length === 0 && i < 100; i++)
    await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(replies.at(-1), raw);
  report.criteria.push(
    'invalid JSON saves and sends exact original CRLF payload to both real WebSocket endpoints',
  );

  await editor.fill('{"x":1}');
  await valid();
  assert.equal(await page.locator('.json-error-line').count(), 0);
  await editor.press('End');
  await editor.press('Backspace');
  await invalid();
  await editor.press('Control+z');
  await valid();
  await editor.press('Control+y');
  await invalid();
  assert.equal(
    await editor.evaluate((el) => el === document.activeElement),
    true,
  );
  await editor.fill('{"stale":');
  await editor.fill('null');
  await valid();
  for (const text of ['[]', '"string"', '42', 'true', 'false', 'null']) {
    await editor.fill(text);
    await valid();
  }
  await page.locator('#json-mode').selectOption('text');
  await editor.fill('plain <tag> text');
  await page.waitForTimeout(250);
  assert.equal(await status.textContent(), 'Text');
  assert.equal(await editor.getAttribute('aria-invalid'), 'false');
  assert.equal(await page.locator('#highlight span').count(), 0);
  await page.locator('#json-mode').selectOption('json');
  await invalid();
  await editor.fill(' \n\t');
  await page.waitForTimeout(250);
  assert.equal(await status.textContent(), 'JSON · пусто');
  assert.equal(await editor.getAttribute('aria-invalid'), 'false');
  await page.locator('#new-draft').click();
  await page.locator('#dirty-confirm').click();
  assert.equal(await status.textContent(), 'JSON · пусто');
  await page.locator('[data-template="raw"]').click();
  await invalid();
  await page.locator('[data-template="plain"]').click();
  await invalid();
  assert.equal(await editor.inputValue(), 'ordinary text');
  await page.locator('#json-mode').selectOption('text');
  assert.equal(await page.locator('.json-error-line').count(), 0);
  report.criteria.push(
    'valid/invalid/undo/redo; all JSON roots; neutral empty/Text; source reset and stale-check cancellation',
  );

  await page.locator('#json-mode').selectOption('json');
  await editor.fill('line 2 column 1\nxx');
  await invalid();
  assert.equal(await page.locator('.json-error-line').count(), 0);
  await status.click();
  assert.match(
    await page.locator('#json-error-description').textContent(),
    /Точная позиция недоступна/,
  );
  await page.locator('#json-details-close').click();
  report.criteria.push(
    'quoted payload cannot create a false error-location marker; honest no-position fallback',
  );

  await page.locator('#json-mode').selectOption('json');
  const long =
    '{\n' +
    Array.from({ length: 4000 }, (_, i) => `"k${i}": "value ${i}",`).join(
      '\n',
    ) +
    '\n}';
  let ticks = 0;
  const traffic = setInterval(() => {
    if (peer?.readyState === WebSocket.OPEN) {
      peer.send(JSON.stringify({ tick: ++ticks }));
    }
  }, 40);
  try {
    report.longInputMs = await editor.evaluate((el, value) => {
      const start = performance.now();
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return performance.now() - start;
    }, long);
    await editor.evaluate((el) => {
      el.setSelectionRange(42, 42);
      el.scrollTop = 240;
      el.focus();
    });
    const before = await editor.evaluate((el) => ({
      start: el.selectionStart,
      top: el.scrollTop,
    }));
    await invalid();
    const after = await editor.evaluate((el) => ({
      start: el.selectionStart,
      top: el.scrollTop,
      focused: el === document.activeElement,
    }));
    assert.equal(after.start, before.start);
    assert.equal(after.top, before.top);
    assert.equal(after.focused, true);
    assert.ok(ticks > 0);
    assert.equal(await page.locator('.json-error-line').textContent(), '!4002');
    await page.waitForFunction(
      () => document.querySelectorAll('#chat article').length > 2,
    );
  } finally {
    clearInterval(traffic);
  }
  report.criteria.push(
    'large 4002-line JSON during real live traffic: caret, focus and scroll preserved, marker follows line',
  );

  await editor.fill('{\n  "type": "subscribe",\n  "topic": "builds",\n}');
  await invalid();
  await page.screenshot({
    path: resolve(directory, `${report.mode}-wide.png`),
  });
  const resize = async (width) => {
    if (desktop)
      await desktop.evaluate(
        ({ BrowserWindow }, width) =>
          BrowserWindow.getAllWindows()[0].setSize(width, 844),
        width,
      );
    else await page.setViewportSize({ width, height: 844 });
  };
  await resize(390);
  await page.locator('[data-mobile="editor"]').click();
  await status.click();
  await page
    .locator('#json-parser-message')
    .locator('..')
    .locator('summary')
    .click();
  await page.locator('#send-message').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('#send-message').isVisible(), true);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: resolve(directory, `${report.mode}-narrow.png`),
  });
  await page.locator('#json-details-close').click();
  await resize(1600);
  await page.locator('#collapse-editor').click();
  await page.locator('#restore-editor').click();
  assert.equal(
    await editor.inputValue(),
    '{\n  "type": "subscribe",\n  "topic": "builds",\n}',
  );
  report.criteria.push(
    'wide/narrow 390px; expanded details and sending reachable; collapse/restore preserves draft',
  );
  assert.deepEqual(errors, []);
  report.result = 'PASS';
} catch (error) {
  report.result = 'FAIL';
  report.failure = error.stack.slice(0, 1200) + error.stack.slice(-1200);
  await page
    ?.screenshot({
      path: resolve(directory, `${report.mode}-failure.png`),
      timeout: 5000,
    })
    .catch(() => {});
  report.editorState = await page
    ?.locator('#message-text')
    .evaluate((el) => ({
      length: el.value.length,
      box: el.getBoundingClientRect().toJSON(),
      editable: !el.readOnly,
      disabled: el.disabled,
    }))
    .catch(() => null);
  process.exitCode = 1;
} finally {
  await writeFile(
    resolve(directory, `${report.mode}.json`),
    JSON.stringify(report, null, 2),
  );
  external?.terminate();
  peer?.terminate();
  await desktop?.close();
  await browser?.close();
  await new Promise((resolve) => upstream.close(resolve));
  await service.close();
  console.log(JSON.stringify(report, null, 2));
}
