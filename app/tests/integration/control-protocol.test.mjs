import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { WebSocket, WebSocketServer } from 'ws';
import { bindControl } from '../../dist/backend/control/control.js';
import { startService } from '../../dist/runtime/service.js';
import {
  isControlClientMessage,
  commandRequestId,
} from '../../dist/backend/control/control.validation.js';
import {
  parseControlServerMessage,
  startControl,
} from '../../dist/frontend/control-client/control-client.js';
import { AppModel } from '../../dist/frontend/app-model/model.js';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function wait(predicate, timeout = 5000) {
  const until = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > until) throw new Error('Condition timeout');
    await delay(10);
  }
}
const settings = {
  url: 'ws://127.0.0.1:9000',
  host: '127.0.0.1',
  port: 0,
  protocol: '',
};
const state = {
  instance: 'instance',
  revision: 0,
  session: 0,
  listener: false,
  autoForward: true,
  client: 'disconnected',
  server: 'disconnected',
  settings,
  clientAddress: '',
  error: null,
};
const entry = {
  id: 1,
  session: 0,
  time: '2026-10-16T00:00:00Z',
  side: 'client',
  text: '🙂\n<b>literal</b>',
  status: 'Не переслано',
};
const wire = (value) => JSON.stringify(value);

test('control contract validates six commands and their actual JSON representations', () => {
  for (const action of [
    'listen',
    'connect',
    'disconnect-client',
    'disconnect-server',
    'stop-listener',
    'clear',
  ]) {
    const command = {
      id: 'request',
      instance: 'instance',
      action,
      ...(['listen', 'connect'].includes(action) ? { settings } : {}),
      ...(action === 'clear' ? { shown: [1] } : {}),
    };
    assert.equal(
      isControlClientMessage(JSON.parse(wire(command))),
      true,
      action,
    );
  }
  for (const value of [
    null,
    [],
    {},
    { id: 2, instance: 'i', action: 'clear', shown: [] },
    { id: '', instance: 'i', action: 'clear', shown: [] },
    { id: 'a', instance: '', action: 'clear', shown: [] },
    { id: 'a', instance: 'i', action: 'future' },
    { id: 'a', instance: 'i', action: 'clear' },
    { id: 'a', instance: 'i', action: 'clear', shown: ['1'] },
    { id: 'a', instance: 'i', action: 'clear', shown: [null] },
    { id: 'a', instance: 'i', action: 'listen' },
    {
      id: 'a',
      instance: 'i',
      action: 'connect',
      settings: { ...settings, url: 12 },
    },
    {
      id: 'a',
      instance: 'i',
      action: 'listen',
      settings: { ...settings, port: NaN },
    },
    {
      id: 'a',
      instance: 'i',
      action: 'listen',
      settings: { ...settings, port: 65536 },
    },
    {
      id: 'a',
      instance: 'i',
      action: 'connect',
      settings: { ...settings, protocol: 'bad protocol' },
    },
  ]) {
    assert.equal(
      isControlClientMessage(JSON.parse(wire(value))),
      false,
      wire(value),
    );
  }
  assert.equal(
    commandRequestId({ id: { unsafe: 'id' }, action: 'clear' }),
    undefined,
  );
  assert.equal(commandRequestId({ id: 'ok', type: 'other' }), undefined);
});

test('server packets are checked in full after JSON decoding, not cast', () => {
  const packets = [
    { type: 'snapshot', state, entries: [entry] },
    {
      type: 'change',
      state: { ...state, revision: 1 },
      entries: [{ ...entry, change: 'updated' }],
      removed: [2],
    },
    { type: 'result', id: 'r', ok: true },
    { type: 'result', id: 'r', ok: false, error: 'reason' },
    { type: 'error', message: 'reason' },
  ];
  for (const packet of packets)
    assert.deepEqual(parseControlServerMessage(wire(packet)), packet);
  for (const value of [
    null,
    [],
    {},
    { type: 'future' },
    { type: 'result', id: 2, ok: true },
    { type: 'result', id: '', ok: true },
    { type: 'result', id: 'r', ok: 'true' },
    { type: 'result', id: 'r', ok: false },
    { type: 'error', message: 2 },
    { type: 'snapshot', state: { ...state, revision: NaN }, entries: [] },
    { type: 'snapshot', state: { ...state, client: 'future' }, entries: [] },
    { type: 'snapshot', state, entries: [{ ...entry, text: 2 }] },
    { type: 'snapshot', state, entries: [{ ...entry, reason: null }] },
    { type: 'change', state, entries: [entry], removed: [] },
    { type: 'change', state, entries: [], removed: ['1'] },
    { type: 'snapshot', state, entries: null },
    { type: 'snapshot', state: { ...state, settings: null }, entries: [] },
  ]) {
    assert.throws(
      () => parseControlServerMessage(wire(value)),
      undefined,
      wire(value),
    );
  }
  assert.throws(() => parseControlServerMessage('{'));
});

async function control(t, service) {
  const packets = [];
  const socket = new WebSocket(
    service.url.replace('http:', 'ws:') + '/control',
    { origin: service.url },
  );
  socket.on('message', (data) =>
    packets.push(parseControlServerMessage(data.toString())),
  );
  socket.on('error', () => {});
  t.after(() => socket.terminate());
  await once(socket, 'open');
  await wait(() => packets.length > 0);
  let n = 0;
  async function command(action, extra = {}) {
    const id = 'cmd-' + ++n;
    socket.send(
      wire({ id, instance: packets[0].state.instance, action, ...extra }),
    );
    await wait(() => packets.some((p) => p.type === 'result' && p.id === id));
    return packets.find((p) => p.type === 'result' && p.id === id);
  }
  return { socket, packets, command };
}

test(
  'real control WS rejects malformed input without mutation; external echo survives binary closure',
  { timeout: 15000 },
  async (t) => {
    const upstream = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await once(upstream, 'listening');
    upstream.on('connection', (s) =>
      s.on('message', (data, binary) => s.send(data, { binary })),
    );
    t.after(async () => {
      for (const s of upstream.clients) s.terminate();
      await new Promise((r) => upstream.close(r));
    });
    const service = await startService({ host: '127.0.0.1', port: 0 });
    t.after(() => service.close());
    const c = await control(t, service);
    const instance = c.packets[0].state.instance;
    const invalid = [
      ['{', 'error'],
      [wire(null), 'error'],
      [wire({ type: 'future' }), 'error'],
      [wire({ id: { untrusted: 'never-reflect' }, action: 'clear' }), 'error'],
      [wire({ id: '', action: 'clear' }), 'error'],
      [wire({ id: 'unknown', instance, action: 'future' }), 'result'],
      [wire({ id: 'missing', instance, action: 'clear' }), 'result'],
      [
        wire({ id: 'bad-shown', instance, action: 'clear', shown: [null] }),
        'result',
      ],
      [
        wire({
          id: 'bad-settings',
          instance,
          action: 'listen',
          settings: { ...settings, port: '8081' },
        }),
        'result',
      ],
      [wire({ id: 'bad-instance', action: 'disconnect-server' }), 'result'],
    ];
    for (const [raw, type] of invalid) {
      const before = c.packets.length;
      c.socket.send(raw);
      await wait(() => c.packets.length > before);
      const packet = c.packets.at(-1);
      assert.equal(packet.type, type);
      if (type === 'result') assert.equal(packet.ok, false);
      else assert.equal('id' in packet, false);
    }
    assert.equal(
      c.packets.filter((p) => p.type === 'change').length,
      0,
      'invalid forms never dispatch',
    );
    const stale = await c.command('clear', { instance: 'stale', shown: [] });
    assert.equal(stale.ok, false);
    assert.match(stale.error, /устарело/);
    assert.equal(
      c.packets.filter((p) => p.type === 'change').length,
      0,
      'state rejection never mutates',
    );
    const current = {
      ...settings,
      url: `ws://127.0.0.1:${upstream.address().port}`,
    };
    assert.equal((await c.command('listen', { settings: current })).ok, true);
    const ready = c.packets.findLast((p) => p.type === 'change').state;
    const external = new WebSocket(ready.clientAddress);
    t.after(() => external.terminate());
    await once(external, 'open');
    assert.equal((await c.command('connect', { settings: current })).ok, true);
    await wait(() =>
      c.packets.some(
        (p) => p.type === 'change' && p.state.server === 'connected',
      ),
    );
    const duplicate = await c.command('connect', { settings: current });
    assert.equal(duplicate.ok, false);
    assert.match(duplicate.error, /уже/);
    async function echo(text) {
      const incoming = once(external, 'message');
      external.send(text);
      assert.equal((await incoming)[0].toString(), text);
    }
    await echo('до отказа 🙂\n<b>literal</b>');
    const closed = once(c.socket, 'close');
    c.socket.send(Buffer.from('{}'));
    assert.equal((await closed)[0], 1003);
    await echo('после отказа служебного канала');
    const restored = await control(t, service);
    assert.equal(restored.packets[0].state.client, 'connected');
    assert.equal(restored.packets[0].state.server, 'connected');
    assert.ok(
      restored.packets[0].entries.some(
        (e) => e.text === 'после отказа служебного канала',
      ),
    );
    const broken = await control(t, service);
    const invalidUtf8 = once(broken.socket, 'close');
    broken.socket.send(Buffer.from([0xff]), { binary: false });
    assert.equal((await invalidUtf8)[0], 1007);
    await echo('после неверного UTF-8 служебного канала');
    assert.equal(
      (
        await restored.command('clear', {
          shown: restored.packets[0].entries.map((e) => e.id),
        })
      ).ok,
      true,
    );
    assert.equal((await restored.command('disconnect-client')).ok, true);
    assert.equal((await restored.command('disconnect-server')).ok, true);
    assert.equal((await restored.command('stop-listener')).ok, true);
    for (const url of [
      '/backend/application/application.protocol.js',
      '/backend/connection/connection.protocol.js',
      '/backend/history/history.protocol.js',
      '/backend/control/control.protocol.js',
      '/shared/contracts.js',
    ])
      assert.equal((await fetch(service.url + url)).status, 200, url);
    for (const url of [
      '/backend/application/application.js',
      '/backend/control/control.validation.js',
    ])
      assert.equal((await fetch(service.url + url)).status, 404, url);
  },
);

test(
  'frontend invalid reply makes outcome unknown immediately; delayed real WS reconnect never replays',
  { timeout: 10000 },
  async (t) => {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await once(server, 'listening');
    const times = [],
      commands = [];
    let latest;
    server.on('connection', (socket) => {
      latest = socket;
      times.push(Date.now());
      socket.send(wire({ type: 'snapshot', state, entries: [entry] }));
      socket.on('message', (data) => {
        commands.push(JSON.parse(data.toString()));
        socket.send(
          wire({ type: 'result', id: commands.at(-1).id, ok: 'yes' }),
        );
      });
    });
    const oldLocation = globalThis.location,
      oldSocket = globalThis.WebSocket;
    globalThis.location = {
      protocol: 'http:',
      host: `127.0.0.1:${server.address().port}`,
    };
    // ws exposes the browser event API while providing real network transport.
    globalThis.WebSocket = WebSocket;
    const model = new AppModel(() => {});
    const stop = startControl(model);
    t.after(async () => {
      stop();
      globalThis.location = oldLocation;
      globalThis.WebSocket = oldSocket;
      for (const s of server.clients) s.terminate();
      await new Promise((r) => server.close(r));
    });
    await wait(() => model.synced);
    model.command('clear', undefined, [1]);
    await wait(() => !model.synced);
    assert.match(model.error, /неизвестен/);
    assert.equal(model.pendingHas('clear'), false);
    await wait(() => times.length === 2 && model.synced);
    assert.ok(times[1] - times[0] >= 900);
    assert.equal(commands.length, 1);
    assert.equal(model.entries.has(1), true);
    assert.match(model.error, /неизвестен/);
    latest.send(
      wire({
        type: 'change',
        state: { ...state, revision: 1 },
        entries: [
          { ...entry, change: 'updated', status: 'Передано на отправку' },
        ],
        removed: [],
      }),
    );
    await wait(() => model.entries.get(1)?.status === 'Передано на отправку');
    latest.send(wire({ type: 'future' }));
    await wait(() => !model.synced);
    await wait(() => times.length === 3 && model.synced);
    assert.ok(times[2] - times[1] >= 900);
    assert.equal(commands.length, 1);
    latest.send(Buffer.from(wire({ type: 'snapshot', state, entries: [] })));
    await wait(() => !model.synced);
  },
);

test('control transport never invokes its application handler for an invalid shape', async (t) => {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  let calls = 0;
  const app = {
    subscribe(callback) {
      callback({ type: 'snapshot', state, entries: [] });
      return () => {};
    },
    async command() {
      calls++;
    },
  };
  server.on('connection', (socket) => bindControl(socket, app));
  const socket = new WebSocket('ws://127.0.0.1:' + server.address().port);
  const packets = [];
  socket.on('message', (data) =>
    packets.push(parseControlServerMessage(data.toString())),
  );
  t.after(async () => {
    socket.terminate();
    for (const s of server.clients) s.terminate();
    await new Promise((r) => server.close(r));
  });
  await once(socket, 'open');
  await wait(() => packets.length === 1);
  for (const command of [
    { id: 'x', action: 'future', instance: 'instance' },
    { id: 'x', action: 'clear', instance: 'instance' },
    {
      id: 'x',
      action: 'listen',
      instance: 'instance',
      settings: { ...settings, port: '0' },
    },
    { id: [], action: 'clear', shown: [] },
  ]) {
    const before = packets.length;
    socket.send(wire(command));
    await wait(() => packets.length > before);
    assert.equal(calls, 0);
  }
  socket.send(
    wire({ id: 'good', action: 'clear', instance: 'instance', shown: [] }),
  );
  await wait(
    () => packets.at(-1).type === 'result' && packets.at(-1).id === 'good',
  );
  assert.equal(calls, 1);
  assert.equal(packets.at(-1).ok, true);
});

test('I03: message-flow contract rejects malformed payloads and validates manual records', () => {
  for (const payload of [
    { action: 'send', target: 'client', text: '' },
    { action: 'send', target: 'server', text: '🙂\n ' },
    { action: 'set-auto-forward', enabled: false },
  ])
    assert.equal(
      isControlClientMessage({ id: 'r', instance: 'i', ...payload }),
      true,
    );
  for (const payload of [
    { action: 'send', target: 'both', text: '' },
    { action: 'send', target: 'server', text: 2 },
    { action: 'send', target: 'server' },
    { action: 'set-auto-forward', enabled: 'false' },
  ])
    assert.equal(
      isControlClientMessage({ id: 'r', instance: 'i', ...payload }),
      false,
    );
  const manual = { ...entry, side: 'user', target: 'server' };
  assert.deepEqual(
    parseControlServerMessage(
      wire({ type: 'snapshot', state, entries: [manual] }),
    ).entries,
    [manual],
  );
  for (const bad of [
    { ...manual, target: undefined },
    { ...manual, target: 'both' },
  ])
    assert.throws(() =>
      parseControlServerMessage(
        wire({ type: 'snapshot', state, entries: [bad] }),
      ),
    );
  assert.throws(() =>
    parseControlServerMessage(
      wire({
        type: 'snapshot',
        state: { ...state, autoForward: 'true' },
        entries: [],
      }),
    ),
  );
});

test('I03: real control syncs global forwarding and rejects invalid/stale/not-ready sends without mutation', async (t) => {
  const service = await startService({ host: '127.0.0.1', port: 0 });
  t.after(() => service.close());
  const a = await control(t, service),
    b = await control(t, service);
  assert.equal(
    (await a.command('set-auto-forward', { enabled: false })).ok,
    true,
  );
  await wait(() => b.packets.at(-1).state?.autoForward === false);
  const restored = await control(t, service);
  assert.equal(restored.packets[0].state.autoForward, false);
  const revision = b.packets.at(-1).state.revision;
  for (const extra of [
    { target: 'server', text: 2 },
    { target: 'server', text: 'not-ready' },
    { instance: 'old', target: 'server', text: 'stale' },
  ]) {
    const result = await a.command('send', extra);
    assert.equal(result.ok, false);
  }
  assert.equal(b.packets.at(-1).state.revision, revision);
  assert.equal(
    (await a.command('set-auto-forward', { enabled: 'false' })).ok,
    false,
  );
  for (const url of [
    '/frontend/message-ui/message-ui.js',
    '/backend/message-flow/message-flow.protocol.js',
  ])
    assert.equal((await fetch(service.url + url)).status, 200);
  assert.equal(
    (await fetch(service.url + '/backend/message-flow/forward.js')).status,
    404,
  );
});
