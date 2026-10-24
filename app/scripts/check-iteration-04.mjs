import assert from 'node:assert/strict';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, _electron } from 'playwright';
import { WebSocketServer, WebSocket } from 'ws';
import { startService } from '../dist/runtime/service.js';

const checks = resolve('out/checks/iteration-04');
await mkdir(checks, { recursive: true });
const service = await startService({ host: '127.0.0.1', port: 0 });
const upstream = new WebSocketServer({ host: '127.0.0.1', port: 0 });
await once(upstream, 'listening');
let peer, browser, desktop, external;
const sent = [],
  replies = [],
  errors = [];
upstream.on('connection', (socket) => {
  peer = socket;
  socket.on('message', (data) => {
    sent.push(data.toString());
    socket.send(data, { binary: false });
  });
});
const report = {
  mode: process.argv.includes('desktop') ? 'electron-source' : 'browser-source',
  node: process.version,
  criteria: [],
  untested: [
    'packaged ZIP',
    'Docker artifact',
    'second physical LAN machine',
    'desktop persistence across origins',
  ],
};
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 960 },
  });
  let page;
  if (report.mode === 'electron-source') {
    desktop = await _electron.launch({ args: ['.'] });
    page = await desktop.firstWindow();
    await page.waitForURL(/^http:\/\//);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  } else {
    page = await context.newPage();
    await page.addInitScript(() => {
      const Native = window.WebSocket;
      window.testSockets = [];
      window.WebSocket = class extends Native {
        constructor(...args) {
          super(...args);
          window.testSockets.push(this);
        }
      };
    });
    await page.goto(service.url);
  }
  page.on('pageerror', (error) => errors.push(error.message));
  const synced = () =>
    page
      .locator('#control-state')
      .filter({ hasText: 'синхронизирован' })
      .waitFor();
  const contains = (text) =>
    page.waitForFunction(
      (value) =>
        [...document.querySelectorAll('#chat pre')].some(
          (node) => node.textContent === value,
        ),
      text,
    );
  await synced();
  if (desktop)
    await desktop.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1600, 960),
    );
  const geometry = await page.locator('#workbench').evaluate(() =>
    ['library-pane', 'editor-pane', 'traffic-pane'].map((id) => {
      const r = document.getElementById(id).getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width };
    }),
  );
  assert.ok(geometry[0].x < geometry[1].x && geometry[1].x < geometry[2].x);
  assert.ok(geometry.every((r) => r.y === geometry[0].y));
  const editor = page.locator('#message-text');
  const raw = '  🙂 <b>literal</b>\n{"space":  1}  ';
  await editor.fill(raw);
  await page.locator('#editor-split').focus();
  await page.locator('#editor-split').press('ArrowRight');
  const width = await page
    .locator('#editor-pane')
    .evaluate((e) => e.getBoundingClientRect().width);
  await page.locator('#collapse-editor').click();
  assert.equal(
    await page
      .locator('#editor-pane')
      .evaluate((e) => e.getBoundingClientRect().width),
    44,
  );
  await page.locator('#restore-editor').click();
  assert.equal(
    await page
      .locator('#editor-pane')
      .evaluate((e) => e.getBoundingClientRect().width),
    width,
  );
  assert.equal(await editor.inputValue(), raw);
  await page.locator('#library-split').focus();
  await page.locator('#library-split').press('ArrowRight');
  assert.ok(
    await page
      .locator('#library-pane')
      .evaluate((e) => e.getBoundingClientRect().width > 224),
  );
  const handle = await page.locator('#library-split').boundingBox();
  const beforeDrag = await page
    .locator('#library-pane')
    .evaluate((e) => e.getBoundingClientRect().width);
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 40);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 30, handle.y + 40, {
    steps: 5,
  });
  await page.mouse.up();
  assert.ok(
    (await page
      .locator('#library-pane')
      .evaluate((e) => e.getBoundingClientRect().width)) > beforeDrag,
  );
  await page.locator('#save-toggle').click();
  await page.locator('#template-name').fill('Literal test');
  await page.locator('#save-template').click();
  assert.equal(await page.locator('#template-count').textContent(), '1/20');
  assert.equal(await page.locator('#template-list b').count(), 0);
  await page.reload();
  await synced();
  await page.locator('[data-template]').click();
  assert.equal(await editor.inputValue(), raw);
  assert.equal(await page.locator('#send-message').isDisabled(), true);
  report.criteria.push(
    'real three-pane composition; keyboard resizing; collapse/restore retains width/text; local template survives reload without backend storage',
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
  await page.locator('#auto-forward').click();
  await page.waitForFunction(
    () => !document.querySelector('#auto-forward').checked,
  );
  external.send('from-client-off');
  peer.send('from-server-off');
  await contains('from-client-off');
  await contains('from-server-off');
  assert.ok(
    !sent.includes('from-client-off') && !replies.includes('from-server-off'),
  );
  await page.locator('#send-message').click();
  await contains(raw);
  assert.equal(sent[0], raw);
  const incomingCard = page
    .locator('article')
    .filter({ has: page.locator('pre', { hasText: 'from-server-off' }) })
    .first();
  const toClient = once(external, 'message');
  await incomingCard.locator('[data-repeat]').click();
  assert.equal((await toClient)[0].toString(), 'from-server-off');
  assert.equal(await editor.inputValue(), raw);
  await editor.fill('dirty unchanged');
  await incomingCard.locator('[data-open]').click();
  await page.locator('#dirty-cancel').click();
  assert.equal(await editor.inputValue(), 'dirty unchanged');
  assert.equal(await page.locator('#message-target').inputValue(), 'server');
  await incomingCard.locator('[data-open]').click();
  await page.locator('#dirty-confirm').click();
  assert.equal(await editor.inputValue(), 'from-server-off');
  await editor.fill('working draft');
  await editor.focus();
  external.send('new-live-with-draft');
  await contains('new-live-with-draft');
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    'message-text',
  );
  assert.equal(await editor.inputValue(), 'working draft');
  await page.locator('#clear').click();
  await page.waitForFunction(
    () => !document.querySelector('#traffic-list article'),
  );
  assert.equal(await editor.inputValue(), 'working draft');
  assert.equal(await page.locator('[data-template]').count(), 1);
  report.criteria.push(
    'real bidirectional observations with forwarding OFF; literal manual send; repeat captures correct recipient; dirty replacement cancel/confirm; live and clear preserve draft/focus/library',
  );
  peer.send('{"response":"real WebSocket server"}');
  external.send('{"request":"real WebSocket client"}');
  await contains('{"request":"real WebSocket client"}');
  if (!desktop) {
    const count = sent.length;
    await page.evaluate(() => window.testSockets.at(-1).close());
    await page
      .locator('#control-state')
      .filter({ hasText: 'потеряна' })
      .waitFor();
    assert.equal(await page.locator('#send-message').isDisabled(), true);
    await page.locator('[data-template]').click();
    await page.locator('#dirty-confirm').click();
    assert.equal(await editor.inputValue(), raw);
    await synced();
    assert.equal(sent.length, count);
    report.criteria.push(
      'control disconnect blocks sends; offline template load remains usable; reconnect never replays',
    );
  }
  await page.screenshot({ path: resolve(checks, report.mode + '-wide.png') });
  if (desktop)
    await desktop.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(390, 844),
    );
  else await page.setViewportSize({ width: 390, height: 844 });
  for (const pane of ['library', 'editor', 'traffic']) {
    await page.locator(`[data-mobile="${pane}"]`).click();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: resolve(checks, report.mode + '-narrow-' + pane + '.png'),
    });
  }
  report.criteria.push(
    '390px: all three mobile areas reachable without horizontal document overflow',
  );
  if (desktop)
    await desktop.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1600, 960),
    );
  else await page.setViewportSize({ width: 1600, height: 960 });
  const cr = 'a\r\nb\rc';
  const longRaw = JSON.stringify({
    label: 'long-inspect',
    nested: {
      rows: Array.from({ length: 100 }, (_, i) => ({ i, value: 'text' })),
      token: 'x'.repeat(6000),
    },
  });
  peer.send(longRaw);
  const longCard = page.locator('article').filter({ hasText: 'long-inspect' });
  await longCard.waitFor();
  await longCard.locator('[data-expand]').click();
  assert.notEqual(await longCard.locator('pre').textContent(), longRaw);
  await longCard.locator('[data-open]').click();
  if (await page.locator('#dirty-dialog').isVisible())
    await page.locator('#dirty-confirm').click();
  assert.equal(await editor.inputValue(), longRaw);
  await editor.evaluate((e) => {
    e.focus();
    e.setSelectionRange(10, 20);
    e.scrollLeft = 120;
  });
  const caret = await editor.evaluate((e) => [
    e.selectionStart,
    e.selectionEnd,
    e.scrollLeft,
  ]);
  for (let i = 0; i < 30; i++) peer.send('live-' + i);
  await contains('live-29');
  assert.equal(await editor.inputValue(), longRaw);
  assert.deepEqual(
    await editor.evaluate((e) => [
      e.selectionStart,
      e.selectionEnd,
      e.scrollLeft,
    ]),
    caret,
  );
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    'message-text',
  );
  await page.locator('#chat').evaluate((e) => {
    e.scrollTop = 50;
  });
  peer.send('live-while-reading');
  await contains('live-while-reading');
  assert.equal(await page.locator('#chat').evaluate((e) => e.scrollTop), 50);
  report.criteria.push(
    'pointer resizing; long nested JSON preview does not change source; live preserves editor text/caret/focus and chat reading position',
  );
  await page.evaluate(
    (value) =>
      localStorage.setItem(
        'wet-ws.templates.v1',
        JSON.stringify({
          version: 1,
          items: [{ id: 'cr', name: 'CR literal', text: value }],
        }),
      ),
    cr,
  );
  await page.reload();
  await synced();
  await page.locator('[data-template="cr"]').click();
  assert.equal(await page.locator('#editor-mode').textContent(), 'Сообщение');
  const exact = once(peer, 'message');
  await page.locator('#send-message').click();
  assert.equal((await exact)[0].toString(), cr);
  await page.locator('#save-toggle').click();
  await page.locator('#template-name').fill('CR copy');
  await page.locator('#save-template').click();
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('wet-ws.templates.v1')).items.at(-1)
          .text,
    ),
    cr,
  );
  await editor.press('Control+End');
  await editor.press('X');
  const edited = once(peer, 'message');
  await page.locator('#send-message').click();
  assert.equal((await edited)[0].toString(), cr + 'X');
  report.criteria.push(
    'CR/CRLF source remains exact through load, no false dirty, save and real send; editing retains untouched line endings',
  );

  await page.evaluate(() => {
    localStorage.setItem('wet-ws.templates.v1', '{');
  });
  await page.reload();
  await synced();
  assert.equal(await page.locator('#library-note').isVisible(), true);
  assert.match(await page.locator('#library-note').textContent(), /недоступна/);
  assert.equal(await page.locator('#save-toggle').isDisabled(), true);
  await editor.fill('draft with corrupt storage');
  assert.equal(await editor.inputValue(), 'draft with corrupt storage');
  assert.equal(
    await page.evaluate(() => localStorage.getItem('wet-ws.templates.v1')),
    '{',
  );
  await page.evaluate(() => localStorage.removeItem('wet-ws.templates.v1'));
  await page.reload();
  await synced();
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
    };
  });
  await editor.fill('quota draft');
  await page.locator('#save-toggle').click();
  await page.locator('#template-name').fill('quota');
  await page.locator('#save-template').click();
  assert.equal(await page.locator('#save-error').isVisible(), true);
  assert.match(await page.locator('#save-error').textContent(), /quota/i);
  assert.equal(await page.locator('#template-count').textContent(), '0/20');
  assert.equal(await editor.inputValue(), 'quota draft');
  await page.reload();
  await synced();
  await page.evaluate(() =>
    localStorage.setItem(
      'wet-ws.templates.v1',
      JSON.stringify({
        version: 1,
        items: Array.from({ length: 20 }, (_, i) => ({
          id: String(i),
          name: 'same name',
          text: 'literal ' + i,
        })),
      }),
    ),
  );
  await page.reload();
  await synced();
  assert.equal(await page.locator('#template-count').textContent(), '20/20');
  assert.equal(await page.locator('#save-toggle').isDisabled(), true);
  await page.locator('[data-template="19"]').click();
  assert.equal(await editor.inputValue(), 'literal 19');
  report.criteria.push(
    'visible storage corruption and quota errors; no false success or overwrite; full 20/20 library still loads',
  );

  peer.send('x'.repeat(4 * 1024 * 1024 + 100));
  const unavailable = page
    .locator('article')
    .filter({ hasText: 'Исходный текст не сохранён' });
  await unavailable.waitFor();
  assert.equal(await unavailable.locator('[data-open]').isDisabled(), true);
  assert.equal(await unavailable.locator('[data-repeat]').isDisabled(), true);
  assert.equal(await editor.inputValue(), 'literal 19');
  report.criteria.push(
    'real oversized history payload is marked unavailable; open/repeat blocked without touching draft',
  );
  assert.deepEqual(errors, []);
  report.result = 'PASS';
} finally {
  report.result ??= 'FAIL';
  await writeFile(
    resolve(checks, report.mode + '-verification.json'),
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
