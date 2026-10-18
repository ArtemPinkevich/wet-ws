import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { WebSocketServer } from 'ws';
import { startService } from '../dist/runtime/service.js';

const root = resolve(import.meta.dirname, '..');
const checks = resolve(process.env.CHECKS_DIR ?? resolve(root, 'out/checks'));
await mkdir(checks, { recursive: true });
const report = {
  checkedAt: new Date().toISOString(),
  node: process.version,
  cases: [],
  kind: 'Controlled connection failures against the shared UI, not ordinary delivery transport evidence.',
  adjustments: [
    'The real browser WebSocket constructor is subclassed only to redirect its destination to a separate loopback HTTP/WS fixture; native connection events and transport remain in use.',
    'The main document response CSP connect-src is extended with this fixture URL for the test only; the application files and served product CSP are unchanged.',
    'The temporary browser context grants local-network-access to the UI origin, so Edge permits the test connection to the separate loopback fixture.',
    'A DOM input event seeds text immediately after the first WebSocket construction on each navigation, before the native handshake can fail.',
  ],
  limitations: [
    'This check does not establish ordinary artifact echo or offline desktop acceptance.',
  ],
};
let browser, page, uiService, fixtureServer, fixtureWs;
let fixtureMode = 'hang';
const sockets = new Set();
const handshakes = [];
const exchanges = [];
const inputText = 'Сохранить ввод: подключение → восстановление\n🙂';
const until = async (check, timeout = 8000) => {
  const deadline = performance.now() + timeout;
  while (!(await check())) {
    if (performance.now() >= deadline)
      throw new Error('Timed out waiting for expected connection state.');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

async function closeFixture() {
  if (!fixtureServer?.listening) return;
  await new Promise((resolveClose, rejectClose) => {
    fixtureServer.close((error) =>
      error ? rejectClose(error) : resolveClose(),
    );
    for (const client of fixtureWs?.clients ?? []) client.terminate();
    fixtureWs?.close();
    for (const socket of sockets) socket.destroy();
  });
}

try {
  try {
    report.sourceId = JSON.parse(
      await readFile(resolve(root, 'out/source-manifest.json'), 'utf8'),
    ).sourceId;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    report.limitations.push(
      'No source manifest was present at the start of this check.',
    );
  }
  fixtureServer = createServer((_request, response) => {
    response.writeHead(404);
    response.end();
  });
  fixtureServer.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('error', () => {});
    socket.once('close', () => sockets.delete(socket));
  });
  fixtureWs = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  fixtureServer.on('upgrade', (request, socket, head) => {
    handshakes.push({
      mode: fixtureMode,
      at: new Date().toISOString(),
      path: request.url,
    });
    if (fixtureMode === 'hang') return;
    if (fixtureMode === 'reject') {
      socket.end(
        'HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n',
      );
      return;
    }
    fixtureWs.handleUpgrade(request, socket, head, (websocket) => {
      websocket.on('error', () => {});
      websocket.on('message', (data, isBinary) => {
        exchanges.push({
          text: data.toString('utf8'),
          bytes: data.byteLength,
          isBinary,
        });
        websocket.send(data, { binary: false });
      });
    });
  });
  await new Promise((resolveListen, rejectListen) => {
    fixtureServer.once('error', rejectListen);
    fixtureServer.listen(0, '127.0.0.1', resolveListen);
  });
  const fixtureUrl = `ws://127.0.0.1:${fixtureServer.address().port}/ws`;
  const deliveryUrl = process.env.DELIVERY_URL;
  if (!deliveryUrl)
    uiService = await startService({ host: '127.0.0.1', port: 0 });
  const uiUrl = new URL(deliveryUrl ?? uiService.url).href;
  report.uiUrl = uiUrl;
  report.uiSource = deliveryUrl ? 'DELIVERY_URL' : 'locally built shared UI';
  report.fixtureUrl = fixtureUrl;
  browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL ?? 'msedge',
    headless: true,
  });
  report.browser = browser.version();
  page = await browser.newPage();
  await page.context().grantPermissions(['local-network-access'], {
    origin: new URL(uiUrl).origin,
  });
  const pageErrors = [];
  report.pageErrors = pageErrors;
  report.consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') report.consoleErrors.push(message.text());
  });

  await page.route(uiUrl, async (route) => {
    const response = await route.fetch();
    const headers = response.headers();
    const csp = headers['content-security-policy'];
    assert.ok(
      csp && /(?:^|;)\s*connect-src\s/.test(csp),
      'Expected the product connection CSP.',
    );
    headers['content-security-policy'] = csp.replace(
      /((?:^|;)\s*connect-src\s+[^;]*)/,
      `$1 ${fixtureUrl}`,
    );
    await route.fulfill({ response, headers });
  });
  await page.addInitScript(
    ({ fixtureUrl, inputText }) => {
      const NativeWebSocket = globalThis.WebSocket;
      const probe = { events: [] };
      globalThis.__wetWsConnectionProbe = probe;
      globalThis.WebSocket = class extends NativeWebSocket {
        constructor(url, protocols) {
          const createdAt = performance.now();
          super(fixtureUrl, protocols);
          const first = probe.events.length === 0;
          probe.events.push({
            event: 'created',
            at: createdAt,
            originalUrl: String(url),
          });
          for (const event of ['open', 'error', 'close']) {
            this.addEventListener(event, () =>
              probe.events.push({ event, at: performance.now() }),
            );
          }
          if (first)
            queueMicrotask(() => {
              const input = document.querySelector('#message');
              input.value = inputText;
              input.dispatchEvent(new Event('input', { bubbles: true }));
            });
        }
        close(...args) {
          probe.events.push({
            event: 'close-requested',
            at: performance.now(),
          });
          return super.close(...args);
        }
      };
    },
    { fixtureUrl, inputText },
  );

  const text = (selector) => page.locator(selector).textContent();
  const elapsed = () =>
    page.evaluate(
      () => performance.now() - globalThis.__wetWsConnectionProbe.events[0].at,
    );
  const assertInput = async () =>
    assert.equal(await page.locator('#message').inputValue(), inputText);
  const recover = async () => {
    const before = exchanges.length;
    fixtureMode = 'echo';
    await page.locator('#action').click();
    await until(
      async () => (await text('#connection')) === 'Соединение готово',
    );
    await assertInput();
    assert.equal(
      exchanges.length,
      before,
      'Reconnect must not send automatically.',
    );
    assert.equal(await page.locator('#reply').inputValue(), '');
    await page.locator('#action').click();
    await until(async () => (await text('#result')) === 'Ответ получен');
    assert.equal(await page.locator('#reply').inputValue(), inputText);
    assert.equal(exchanges.length, before + 1);
    assert.equal(exchanges.at(-1).text, inputText);
    assert.equal(exchanges.at(-1).isBinary, false);
  };

  await page.goto(uiUrl);
  await until(() => handshakes.some((item) => item.mode === 'hang'));
  await assertInput();
  assert.equal(
    await page.locator('#action').getAttribute('aria-disabled'),
    'true',
  );
  await until(async () => (await elapsed()) >= 4400, 6000);
  const beforeTimeoutMs = await elapsed();
  assert.ok(
    beforeTimeoutMs < 5000,
    `Pre-deadline observation arrived too late: ${beforeTimeoutMs}ms.`,
  );
  assert.equal(
    await page.locator('#action').getAttribute('aria-disabled'),
    'true',
  );
  assert.equal(await text('#connection'), 'Соединение: подключаемся…');
  assert.equal(exchanges.length, 0);
  await until(async () =>
    (await text('#result')).includes('Истекло время подключения'),
  );
  const timeoutObservedMs = await elapsed();
  assert.ok(
    timeoutObservedMs >= 5000,
    `Timeout observed too early: ${timeoutObservedMs}ms.`,
  );
  assert.equal(await text('#action'), 'Подключиться снова');
  await assertInput();
  const hangEvents = await page.evaluate(
    () => globalThis.__wetWsConnectionProbe.events,
  );
  assert.equal(
    hangEvents.some((item) => item.event === 'open'),
    false,
  );
  await recover();
  report.cases.push({
    name: 'Native handshake held open: timeout, preserved input, manual reconnect then send',
    beforeTimeoutMs,
    timeoutObservedMs,
    events: hangEvents,
  });

  fixtureMode = 'reject';
  await page.reload();
  await until(async () => (await text('#action')) === 'Подключиться снова');
  await assertInput();
  assert.ok(handshakes.some((item) => item.mode === 'reject'));
  const rejectEvents = await page.evaluate(
    () => globalThis.__wetWsConnectionProbe.events,
  );
  const rejection = rejectEvents.find((item) => item.event === 'error');
  assert.ok(rejection, 'Expected a real native WebSocket error for HTTP 503.');
  const rejectionMs = rejection.at - rejectEvents[0].at;
  assert.ok(
    rejectionMs < 5000,
    `HTTP rejection must precede the connection deadline: ${rejectionMs}ms.`,
  );
  assert.equal(
    rejectEvents.some((item) => item.event === 'open'),
    false,
  );
  assert.ok(!(await text('#result')).includes('Истекло время подключения'));
  await recover();
  report.cases.push({
    name: 'Native handshake rejected with HTTP 503: error, preserved input, manual reconnect then send',
    rejectionMs,
    events: rejectEvents,
  });
  assert.deepEqual(pageErrors, []);
  report.handshakes = handshakes;
  report.echoesAfterExplicitSend = exchanges;
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.stack ?? String(error);
  if (page && !page.isClosed()) {
    try {
      report.finalUi = await page.evaluate(() => ({
        connection: document.querySelector('#connection')?.textContent,
        result: document.querySelector('#result')?.textContent,
        probe: globalThis.__wetWsConnectionProbe,
      }));
    } catch {
      /* Preserve the original failure when the renderer is unavailable. */
    }
  }
  process.exitCode = 1;
} finally {
  const cleanup = await Promise.allSettled([
    Promise.resolve().then(() => browser?.close()),
    Promise.resolve().then(() => uiService?.close()),
    Promise.resolve().then(closeFixture),
  ]);
  const cleanupErrors = cleanup
    .filter((item) => item.status === 'rejected')
    .map((item) => String(item.reason));
  if (cleanupErrors.length) {
    report.cleanupErrors = cleanupErrors;
    report.status = 'failed';
    process.exitCode = 1;
  }
  await writeFile(
    resolve(checks, 'connection.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(
    JSON.stringify({
      status: report.status,
      cases: report.cases.length,
      error: report.error,
      report: resolve(checks, 'connection.json'),
    }),
  );
}
