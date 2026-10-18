import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { WebSocket } from 'ws';
import { startService } from '../../dist/runtime/service.js';

let assetsDir;
before(async () => {
  assetsDir = await mkdtemp(join(tmpdir(), 'wet-ws-service-'));
  await mkdir(join(assetsDir, 'app-shell'));
  for (const [file, text] of Object.entries({
    'index.html': '<!doctype html><title>Local UI</title>',
    'app.js': 'export const app = true;',
    'controller.js': 'export const controller = true;',
    'styles.css': 'body { color: black; }',
  }))
    await writeFile(join(assetsDir, 'app-shell', file), text);
});
after(async () => rm(assetsDir, { recursive: true, force: true }));

async function fixture(t, options = {}) {
  const service = await startService({
    host: '127.0.0.1',
    port: 0,
    assetsDir,
    ...options,
  });
  t.after(() => service.close());
  return service;
}

async function connect(t, service) {
  const socket = new WebSocket(
    `${service.url.replace('http:', 'ws:')}/control`,
    {
      origin: service.url,
      handshakeTimeout: 2000,
    },
  );
  socket.on('error', () => {});
  t.after(() => socket.terminate());
  await once(socket, 'open');
  return socket;
}

function http(service, path, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: '127.0.0.1',
        port: service.port,
        path,
        method,
        headers,
        agent: false,
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('error', reject);
        response.on('end', () =>
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    req.on('error', reject);
    req.on('upgrade', (_response, socket) => {
      socket.destroy();
      reject(new Error('Unexpected successful upgrade.'));
    });
    req.end();
  });
}

function upgradeHeaders(service, extra = {}) {
  return {
    Connection: 'Upgrade',
    Upgrade: 'websocket',
    'Sec-WebSocket-Version': '13',
    'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
    Origin: service.url,
    ...extra,
  };
}

test('WebSocket rejects a foreign/missing Origin, foreign Host and unexpected path', async (t) => {
  const service = await fixture(t);
  for (const origin of ['http://example.invalid', 'null', `${service.url}/`]) {
    assert.equal(
      (
        await http(service, '/control', {
          headers: upgradeHeaders(service, { Origin: origin }),
        })
      ).status,
      403,
    );
  }
  const missing = upgradeHeaders(service);
  delete missing.Origin;
  assert.equal(
    (await http(service, '/control', { headers: missing })).status,
    403,
  );
  assert.equal(
    (
      await http(service, '/control', {
        headers: upgradeHeaders(service, { Host: 'example.invalid' }),
      })
    ).status,
    403,
  );
  for (const path of ['/other', '/control?query=yes', '/control/']) {
    assert.equal(
      (await http(service, path, { headers: upgradeHeaders(service) })).status,
      403,
    );
  }
  // Rejections do not poison later valid connections.
  await connect(t, service);
});

test('HTTP serves only allowlisted resources with correct MIME and restrictive headers', async (t) => {
  const service = await fixture(t);
  for (const [path, type] of [
    ['/', 'text/html'],
    ['/ui/app.js', 'text/javascript'],
    ['/ui/controller.js', 'text/javascript'],
    ['/ui/styles.css', 'text/css'],
    ['/shared/limits.js', 'text/javascript'],
  ]) {
    const response = await http(service, path);
    assert.equal(response.status, 200, path);
    assert.match(
      response.headers['content-type'],
      new RegExp(`^${type}; charset=utf-8$`),
    );
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.match(
      response.headers['content-security-policy'],
      /default-src 'none'/,
    );
    assert.ok(
      response.headers['content-security-policy'].includes(
        "connect-src 'self'",
      ),
    );
    assert.ok(response.body.length > 0);
  }
  assert.equal((await http(service, '/', { method: 'HEAD' })).body, '');
  assert.equal((await http(service, '/', { method: 'POST' })).status, 405);
  assert.equal(
    (await http(service, '/', { headers: { Host: 'localhost' } })).status,
    403,
  );
  for (const path of [
    '/service.js',
    '/ui/',
    '/ui/../service.js',
    '/%2e%2e/package.json',
    '/?v=1',
    '/control',
  ]) {
    assert.equal((await http(service, path)).status, 404, path);
  }
});

test('wildcard container binding still advertises and accepts the loopback origin', async (t) => {
  const service = await fixture(t, { host: '0.0.0.0' });
  assert.equal(service.url, `http://127.0.0.1:${service.port}`);
  await connect(t, service);
});

test(
  'closing is idempotent and releases active WS and incomplete HTTP sockets',
  { timeout: 5000 },
  async (t) => {
    const service = await fixture(t);
    const websocket = await connect(t, service);
    const websocketClosed = once(websocket, 'close');
    const unfinished = createConnection({
      host: '127.0.0.1',
      port: service.port,
    });
    unfinished.on('error', () => {});
    t.after(() => unfinished.destroy());
    await once(unfinished, 'connect');
    unfinished.write(`GET / HTTP/1.1\r\nHost: 127.0.0.1:${service.port}\r\n`);
    // Forced shutdown may reset a partial request; the requirement is release, not a response.
    const unfinishedClosed = new Promise((resolve) =>
      unfinished.once('close', resolve),
    );
    const closing = service.close();
    assert.equal(service.close(), closing);
    await Promise.all([closing, websocketClosed, unfinishedClosed]);
    await assert.rejects(http(service, '/'), { code: 'ECONNREFUSED' });
  },
);

test('invalid options and occupied listening port fail explicitly', async (t) => {
  for (const port of [-1, 65536, 1.5, Number.NaN]) {
    await assert.rejects(startService({ host: '127.0.0.1', port }), /PORT/);
  }
  await assert.rejects(
    startService({ host: 'example.invalid', port: 0 }),
    /HOST/,
  );
  const service = await fixture(t);
  await assert.rejects(
    startService({ host: '127.0.0.1', port: service.port }),
    { code: 'EADDRINUSE' },
  );
});
