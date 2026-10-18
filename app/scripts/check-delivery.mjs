import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { chromium, _electron as electron } from 'playwright';
import { startService } from '../dist/runtime/service.js';

const mode = process.argv[2];
assert.ok(['browser', 'desktop'].includes(mode), 'Choose browser or desktop');
const root = resolve(import.meta.dirname, '..');
const checks = resolve(root, process.env.CHECKS_DIR ?? 'out/checks');
await mkdir(checks, { recursive: true });
const diagnosticsPath = resolve(checks, 'desktop-service.jsonl');
const report = {
  mode,
  checkedAt: new Date().toISOString(),
  node: process.version,
  cases: [],
  transport: [],
  limitations: [],
};
const manifestPath = resolve(root, 'out/source-manifest.json');
const diagnostics = [];
const frames = [];
const requests = [];
const errors = [];
let browser, desktop, service, page;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const until = async (check, timeout = 8000) => {
  const deadline = Date.now() + timeout;
  while (!(await check())) {
    if (Date.now() >= deadline)
      throw new Error('Timed out waiting for expected UI state');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
};
const text = (selector) => page.locator(selector).textContent();
const ready = () =>
  until(async () => (await text('#connection')) === 'Соединение готово');
try {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  report.sourceId = manifest.sourceId;
  const snapshot = resolve(root, 'out/source-snapshots', manifest.sourceId);
  for (const [name, expected] of Object.entries(manifest.files)) {
    assert.equal(
      hash(await readFile(resolve(snapshot, name))),
      expected,
      `Frozen source file: ${name}`,
    );
  }
  report.sourceSnapshot = snapshot;
  if (mode === 'desktop') {
    await writeFile(diagnosticsPath, '');
    const executablePath =
      process.env.DESKTOP_EXE ??
      resolve(root, 'out/build/manual/wet-ws-ai.exe');
    const env = {
      ...process.env,
      WET_WS_DIAGNOSTICS_FILE: diagnosticsPath,
      PATH: `${process.env.SystemRoot}\\System32;${process.env.SystemRoot}`,
    };
    delete env.ELECTRON_RUN_AS_NODE;
    desktop = await electron.launch({
      executablePath,
      args: [`--user-data-dir=${resolve(checks, 'desktop-profile')}`],
      env,
      timeout: 25000,
    });
    page = await desktop.firstWindow();
    report.artifact = executablePath;
    report.artifactHashes = {
      executable: hash(await readFile(executablePath)),
      asar: hash(
        await readFile(resolve(executablePath, '../resources/app.asar')),
      ),
    };
    report.versions = await desktop.evaluate(() => process.versions);
    report.limitedPath = env.PATH;
    if (process.env.OFFLINE_MONITORING === '1') {
      report.networkVerification =
        'Separate host-network monitoring: see offline-verification.json for the combined verdict.';
    } else {
      report.limitations.push(
        'OS network isolation was not checked in this run; see a separate offline-verification.json when available.',
      );
    }
    await ready();
    assert.equal(await page.locator('#message').inputValue(), '');
    report.cases.push(
      'packaged desktop cold start: window, local service and empty input ready before reload',
    );
    const externalBlocked = await desktop.evaluate(async ({ net }) => {
      try {
        await net.fetch('https://example.com');
        return false;
      } catch {
        return true;
      }
    });
    assert.equal(
      externalBlocked,
      true,
      'Desktop session must deny external requests',
    );
    report.cases.push('desktop session rejects an external HTTPS request');
  } else {
    const url = process.env.DELIVERY_URL;
    if (!url)
      service = await startService({
        host: '127.0.0.1',
        port: 0,
        diagnostics: (event) => diagnostics.push(event),
      });
    browser = await chromium.launch({
      channel: process.env.BROWSER_CHANNEL ?? 'msedge',
      headless: true,
    });
    page = await browser.newPage({ viewport: { width: 960, height: 760 } });
    report.browser = browser.version();
    report.url = url ?? service.url;
    if (!url)
      report.limitations.push(
        'Standalone Node service; this run does not verify a Docker artifact.',
      );
    if (process.env.DELIVERY_CONTAINER) {
      const container = JSON.parse(
        execFileSync('docker', ['inspect', process.env.DELIVERY_CONTAINER], {
          encoding: 'utf8',
        }),
      )[0];
      const image = JSON.parse(
        execFileSync('docker', ['image', 'inspect', container.Image], {
          encoding: 'utf8',
        }),
      )[0];
      report.container = {
        name: container.Name,
        imageId: container.Image,
        ports: container.NetworkSettings.Ports,
      };
      assert.equal(
        image.Config.Labels?.['org.opencontainers.image.revision'],
        manifest.sourceId,
        'Image must identify the frozen source snapshot',
      );
    }
  }
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => requests.push(request.url()));
  // Playwright 1.63 filters empty payloads in its high-level websocket events.
  // Observe CDP directly so an empty text message remains observable.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  cdp.on('Network.webSocketFrameSent', ({ response }) =>
    frames.push({
      direction: 'sent',
      payload: response.payloadData,
      opcode: response.opcode,
    }),
  );
  cdp.on('Network.webSocketFrameReceived', ({ response }) =>
    frames.push({
      direction: 'received',
      payload: response.payloadData,
      opcode: response.opcode,
    }),
  );
  if (desktop) await page.reload();
  else await page.goto(report.url);
  await ready();
  await page.locator('#message').focus();
  await page.keyboard.press('Tab');
  assert.equal(
    await page
      .locator('#action')
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.keyboard.press('Tab');
  assert.equal(
    await page
      .locator('#reply')
      .evaluate((el) => el === document.activeElement),
    true,
  );
  report.cases.push('keyboard: input → action → reply');

  const samples = [
    'Привет, WebSocket!\nПроверка локального обмена.',
    '',
    '   ',
    '  первая\nвторая\n',
    '<b>тест</b>',
    '😀漢字',
    'я'.repeat(32768),
  ];
  for (const sample of samples) {
    const start = frames.length;
    await page.locator('#message').fill(sample);
    await page.locator('#action').click();
    await until(async () =>
      (await text('#result')).startsWith('Ответ получен'),
    );
    assert.equal(await page.locator('#reply').inputValue(), sample);
    await until(() =>
      frames
        .slice(start)
        .some(
          (item) =>
            item.direction === 'received' &&
            item.payload === sample &&
            item.opcode === 1,
        ),
    );
    const exchange = frames.slice(start);
    assert.ok(
      exchange.some(
        (item) =>
          item.direction === 'sent' &&
          item.payload === sample &&
          item.opcode === 1,
      ),
      'Real outgoing WS text frame',
    );
    assert.ok(
      exchange.some(
        (item) =>
          item.direction === 'received' &&
          item.payload === sample &&
          item.opcode === 1,
      ),
      'Real incoming WS text frame',
    );
    const bytes = Buffer.byteLength(sample);
    report.transport.push({
      bytes,
      sha256: hash(sample),
      sent: true,
      received: true,
      uiEqual: true,
    });
    if (sample === samples[0])
      await page.screenshot({
        path: resolve(checks, `${mode}.png`),
        fullPage: true,
      });
  }
  assert.equal(await page.locator('#reply b').count(), 0);
  report.cases.push(
    'real echo: empty, whitespace, multiline, markup, Unicode, 65536 UTF-8 bytes',
  );
  const oldReply = await page.locator('#reply').inputValue();
  const frameCount = frames.length;
  await page.locator('#message').fill('я'.repeat(32768) + 'x');
  await page.locator('#action').click();
  assert.match(await text('#validation'), /64 КиБ/);
  assert.equal(frames.length, frameCount);
  assert.equal(await page.locator('#reply').inputValue(), oldReply);
  assert.match(await text('#result'), /предыдущей/);
  report.cases.push(
    '65537 UTF-8 bytes rejected without send or clearing previous reply',
  );

  if (!desktop) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#message').fill('Узкий экран');
    await page.screenshot({
      path: resolve(checks, 'browser-narrow.png'),
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    report.cases.push('390px viewport has no horizontal overflow');
  }
  const appRequests = requests.filter((url) => /^https?:/.test(url));
  assert.ok(appRequests.every((url) => new URL(url).hostname === '127.0.0.1'));
  report.requests = [...new Set(appRequests)];

  // Fault injection checks the actual packaged UI separately from transport evidence above.
  let behavior = 'mismatch';
  await page.routeWebSocket('**/ws', (socket) =>
    socket.onMessage((message) => {
      if (behavior === 'mismatch') socket.send('изменённый ответ');
      else if (behavior === 'echo') socket.send(message);
      else if (behavior === 'close')
        socket.close({ code: 1011, reason: 'controlled test' });
      // silence deliberately leaves the request unanswered.
    }),
  );
  await page.reload();
  await ready();
  await page.locator('#message').fill('исходный текст');
  await page.locator('#action').click();
  await until(async () => (await text('#result')).includes('отличается'));
  assert.equal(await page.locator('#reply').inputValue(), 'изменённый ответ');
  await ready();
  report.cases.push(
    'injected mismatch: actual reply shown, healthy connection retained',
  );
  behavior = 'silence';
  await page.locator('#action').click();
  assert.equal(
    await page.locator('#message').evaluate((el) => el.readOnly),
    true,
  );
  assert.equal(
    await page.locator('#action').getAttribute('aria-disabled'),
    'true',
  );
  assert.equal(
    await page
      .locator('#action')
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.keyboard.press('Enter');
  await until(
    async () => (await text('#result')).includes('Истекло время ожидания'),
    7500,
  );
  assert.equal(
    await page.locator('#message').evaluate((el) => el.readOnly),
    false,
  );
  assert.equal(await page.locator('#reply').inputValue(), '');
  assert.equal(await page.locator('#message').inputValue(), 'исходный текст');
  await page.screenshot({
    path: resolve(checks, `${mode}-timeout.png`),
    fullPage: true,
  });
  behavior = 'echo';
  await page.locator('#action').click();
  await ready();
  assert.match(await text('#result'), /Истекло время ожидания/);
  assert.equal(await page.locator('#reply').inputValue(), '');
  await page.locator('#action').click();
  await until(async () => (await text('#result')) === 'Ответ получен');
  behavior = 'close';
  await page.locator('#action').click();
  await until(async () => (await text('#action')) === 'Подключиться снова');
  assert.equal(await page.locator('#message').inputValue(), 'исходный текст');
  assert.equal(await page.locator('#reply').inputValue(), '');
  report.cases.push(
    'injected silence/close: real 5s timeout, retained focus/input, explicit reconnect then resend',
  );

  let serviceEvents = diagnostics;
  if (desktop)
    serviceEvents = (await readFile(diagnosticsPath, 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  else if (process.env.DELIVERY_CONTAINER) {
    let log;
    if (process.env.DELIVERY_DIAGNOSTICS_FILE) {
      const destination = resolve(checks, 'container-service.jsonl');
      execFileSync('docker', [
        'cp',
        `${process.env.DELIVERY_CONTAINER}:${process.env.DELIVERY_DIAGNOSTICS_FILE}`,
        destination,
      ]);
      log = await readFile(destination, 'utf8');
      report.serviceDiagnostics = {
        containerPath: process.env.DELIVERY_DIAGNOSTICS_FILE,
        file: destination,
      };
    } else {
      log = execFileSync('docker', ['logs', process.env.DELIVERY_CONTAINER], {
        encoding: 'utf8',
      });
    }
    serviceEvents = log
      .split('\n')
      .filter((line) => line.startsWith('{'))
      .map((line) => JSON.parse(line));
  }
  if (serviceEvents.length === 0)
    throw new Error('No server receive/send evidence provided');
  for (const sample of samples) {
    for (const event of ['receive', 'send'])
      assert.ok(
        serviceEvents.some(
          (item) => item.event === event && item.text === sample,
        ),
        `Server ${event} evidence`,
      );
  }
  report.serverEvents = serviceEvents
    .filter((item) => ['receive', 'send'].includes(item.event))
    .map(({ event, connectionId, text, bytes }) => ({
      event,
      connectionId,
      bytes,
      sha256: hash(text),
    }));
  assert.deepEqual(errors, []);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.stack;
  process.exitCode = 1;
} finally {
  const cleanup = await Promise.allSettled([
    Promise.resolve().then(() => desktop?.close()),
    Promise.resolve().then(() => browser?.close()),
    Promise.resolve().then(() => service?.close()),
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
    resolve(checks, `${mode}.json`),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(
    JSON.stringify({
      mode,
      status: report.status,
      cases: report.cases.length,
      error: report.error,
      limitations: report.limitations,
    }),
  );
}
