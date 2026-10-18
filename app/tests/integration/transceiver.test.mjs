import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { WebSocket, WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import { Connection } from '../../dist/backend/connection/connection.js';
import { Application } from '../../dist/backend/application/application.js';
import { History } from '../../dist/backend/history/history.js';
import { parseControlServerMessage } from '../../dist/frontend/control-client/control-client.js';
import { AppModel } from '../../dist/frontend/app-model/model.js';
const wait = async (predicate) => {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Condition did not become true');
};
async function fixture(t, protocol = '') {
  const upstream = new WebSocketServer({
    host: '127.0.0.1',
    port: 0,
    handleProtocols: (offers) =>
      protocol && offers.has(protocol) ? protocol : false,
  });
  await once(upstream, 'listening');
  const received = [];
  let peer;
  upstream.on('connection', (socket) => {
    peer = socket;
    socket.on('message', (data, binary) => {
      received.push(data.toString());
      socket.send(data, { binary });
    });
  });
  const app = new Application(new Connection());
  t.after(async () => {
    await app.close();
    for (const client of upstream.clients) client.terminate();
    await new Promise((resolve) => upstream.close(resolve));
  });
  const settings = {
    url: `ws://127.0.0.1:${upstream.address().port}/events?q=1`,
    host: '127.0.0.1',
    port: 0,
    protocol,
  };
  const command = (action, extra = {}) =>
    app.command({
      id: crypto.randomUUID(),
      instance: app.state.instance,
      action,
      settings,
      ...extra,
    });
  const client = async () => {
    const socket = new WebSocket(
      app.state.clientAddress,
      protocol ? [protocol] : [],
    );
    socket.on('error', () => {});
    t.after(() => socket.terminate());
    await once(socket, 'open');
    return socket;
  };
  return {
    app,
    settings,
    command,
    client,
    received,
    get peer() {
      return peer;
    },
  };
}
test(
  'I02: real bidirectional echo, early messages never replay, disconnects are independent',
  { timeout: 10000 },
  async (t) => {
    const f = await fixture(t);
    await f.command('listen');
    const c = await f.client();
    c.send('before-server');
    await wait(() =>
      f.app.history.entries.some(
        (e) => e.text === 'before-server' && e.status === 'Не переслано',
      ),
    );
    await f.command('connect');
    await wait(() => f.app.state.server === 'connected');
    assert.deepEqual(f.received, []);
    for (const text of ['', ' ', '🙂\n<b>literal</b>', 'same', 'same']) {
      const reply = once(c, 'message');
      c.send(text);
      assert.equal((await reply)[0].toString(), text);
    }
    assert.deepEqual(f.received, [
      '',
      ' ',
      '🙂\n<b>literal</b>',
      'same',
      'same',
    ]);
    const shared = [];
    const unsub = f.app.subscribe((update) => shared.push(update));
    const ids = f.app.history.entries.map((e) => e.id);
    await f.command('clear', { shown: ids });
    assert.equal(f.app.history.entries.length, 0);
    assert.equal(shared.at(-1).removed.length, ids.length);
    const reply = once(c, 'message');
    c.send('after-clear');
    assert.equal((await reply)[0].toString(), 'after-clear');
    await f.command('disconnect-server');
    assert.equal(f.app.state.client, 'connected');
    assert.equal(f.app.state.listener, true);
    c.send('without-server');
    await wait(() =>
      f.app.history.entries.some(
        (e) => e.text === 'without-server' && e.status === 'Не переслано',
      ),
    );
    await f.command('connect');
    await wait(() => f.app.state.server === 'connected');
    assert.equal(f.received.includes('without-server'), false);
    await f.command('disconnect-client');
    assert.equal(f.app.state.server, 'connected');
    assert.equal(f.app.state.listener, true);
    const c2 = await f.client();
    const second = once(c2, 'message');
    c2.send('new-client');
    assert.equal((await second)[0].toString(), 'new-client');
    unsub();
  },
);
test(
  'server-first and common negotiated subprotocol; second client rejected',
  { timeout: 10000 },
  async (t) => {
    const f = await fixture(t, 'demo.v1');
    await f.command('connect');
    await wait(() => f.app.state.server === 'connected');
    f.peer.send('early-server');
    await wait(() =>
      f.app.history.entries.some(
        (e) => e.text === 'early-server' && e.status === 'Не переслано',
      ),
    );
    await f.command('listen');
    const c = await f.client();
    assert.equal(c.protocol, 'demo.v1');
    assert.equal(f.peer.protocol, 'demo.v1');
    const second = new WebSocket(f.app.state.clientAddress, ['demo.v1']);
    second.on('error', () => {});
    await new Promise((resolve) => second.once('close', resolve));
    assert.equal(f.app.state.client, 'connected');
    await assert.rejects(f.command('connect'), /уже/);
    const incoming = once(c, 'message');
    c.send('protocol-echo');
    assert.equal((await incoming)[0].toString(), 'protocol-echo');
  },
);
test('history clearing cannot resurrect deleted status and preserves unshown IDs', () => {
  const h = new History(2, 4096);
  const a = h.add({
    session: 1,
    side: 'client',
    text: 'a',
    status: 'pending',
  }).entry;
  const b = h.add({
    session: 1,
    side: 'server',
    text: 'b',
    status: 'pending',
  }).entry;
  assert.deepEqual(h.clear([a.id]), [a.id]);
  assert.equal(h.update(a.id, 'sent'), undefined);
  assert.deepEqual(
    h.entries.map((e) => e.id),
    [b.id],
  );
  h.add({ session: 1, side: 'client', text: 'c', status: 'pending' });
  h.add({ session: 1, side: 'client', text: 'd', status: 'pending' });
  assert.equal(h.entries.length, 2);
});
test('history status updates respect the byte budget', () => {
  const h = new History(10, 200);
  const item = h.add({
    session: 1,
    side: 'client',
    text: 'x'.repeat(30),
    status: 'pending',
  }).entry;
  const result = h.update(
    item.id,
    'Результат неизвестен',
    'Короткая причина ошибки транспорта',
  );
  assert.ok(result);
  assert.ok(
    h.entries.reduce(
      (sum, e) => sum + Buffer.byteLength(JSON.stringify(e)),
      0,
    ) <= 200,
  );
  assert.deepEqual(result.removed, [item.id]);
});
for (const side of ['client', 'server'])
  test(`binary from ${side} closes both connections with a reason`, async (t) => {
    const f = await fixture(t);
    await f.command('listen');
    const c = await f.client();
    await f.command('connect');
    await wait(() => f.app.state.server === 'connected');
    (side === 'client' ? c : f.peer).send(Buffer.from([1, 2]), {
      binary: true,
    });
    await wait(
      () =>
        f.app.state.client === 'disconnected' &&
        f.app.state.server === 'disconnected',
    );
    assert.match(f.app.state.error, /Бинарное/);
    assert.equal(f.app.state.listener, true);
  });
test(
  'unfinished handshake times out; cancellation prevents a late connection',
  { timeout: 10000 },
  async (t) => {
    const sockets = new Set();
    const server = createServer();
    server.on('connection', (socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    });
    server.on('upgrade', () => {});
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const app = new Application(new Connection());
    t.after(async () => {
      await app.close();
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    });
    const settings = {
      url: `ws://127.0.0.1:${server.address().port}`,
      host: '127.0.0.1',
      port: 0,
      protocol: '',
    };
    const command = (action) =>
      app.command({
        id: crypto.randomUUID(),
        instance: app.state.instance,
        action,
        settings,
      });
    await command('connect');
    await command('disconnect-server');
    assert.equal(app.state.server, 'disconnected');
    await command('connect');
    const start = Date.now();
    while (app.state.server !== 'disconnected' && Date.now() - start < 6500)
      await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(app.state.server, 'disconnected');
    assert.match(app.state.error, /timed out/);
    assert.ok(Date.now() - start >= 4900);
  },
);
test('App Model restores snapshots, rejects revision gaps, never replays lost commands', () => {
  const model = new AppModel(() => {});
  const sent = [];
  let closed = false;
  const state = {
    instance: 'one',
    revision: 0,
    session: 0,
    listener: false,
    autoForward: true,
    client: 'disconnected',
    server: 'disconnected',
    settings: { url: '', host: '0.0.0.0', port: 8081, protocol: '' },
    clientAddress: '',
    error: null,
  };
  model.connected({
    send: (text) => sent.push(text),
    close: () => {
      closed = true;
    },
  });
  model.receive(
    parseControlServerMessage(
      JSON.stringify({ type: 'snapshot', state, entries: [] }),
    ),
  );
  model.command('clear', undefined, [1]);
  assert.equal(model.pendingHas('clear'), true);
  model.disconnected();
  assert.match(model.error, /неизвестен/);
  model.connected({
    send: (text) => sent.push(text),
    close: () => {
      closed = true;
    },
  });
  model.receive(
    parseControlServerMessage(
      JSON.stringify({ type: 'snapshot', state, entries: [] }),
    ),
  );
  assert.equal(sent.length, 1);
  model.receive(
    parseControlServerMessage(
      JSON.stringify({
        type: 'change',
        state: { ...state, revision: 2 },
        entries: [],
        removed: [],
      }),
    ),
  );
  assert.equal(closed, true);
  assert.equal(model.synced, false);
});
test('clear during sending does not cancel the send or resurrect its record; eviction is visible', async () => {
  let complete;
  const port = {
    events: undefined,
    target: () => ({
      send: (_text, callback) => {
        complete = callback;
      },
    }),
    listen: async () => ({ port: 8081, address: 'ws://127.0.0.1:8081' }),
    connect() {},
    disconnect() {},
    stopListener: async () => {},
    close: async () => {},
  };
  const app = new Application(port);
  const updates = [];
  app.subscribe((update) => updates.push(update));
  port.events.text('client', 'pending', 1, 7);
  const id = app.history.entries[0].id;
  await app.command({
    id: 'clear',
    instance: app.state.instance,
    action: 'clear',
    shown: [id],
  });
  port.events.text('server', 'not-shown', 1, 9);
  const retained = app.history.entries[0].id;
  complete();
  assert.deepEqual(
    app.history.entries.map((e) => e.id),
    [retained],
  );
  for (let i = 0; i < 1001; i++) port.events.text('client', String(i), 1, 1);
  assert.equal(app.history.entries.length, 1000);
  assert.match(app.state.historyNotice, /вытеснены/);
  assert.ok(
    updates.some(
      (update) => update.type === 'change' && update.removed.includes(id),
    ),
  );
  port.events.text('client', 'x'.repeat(3 * 1024 * 1024), 1, 3 * 1024 * 1024);
  port.events.text('client', 'y'.repeat(3 * 1024 * 1024), 1, 3 * 1024 * 1024);
  assert.ok(
    app.history.entries.reduce(
      (sum, e) => sum + Buffer.byteLength(JSON.stringify(e)),
      0,
    ) <=
      4 * 1024 * 1024,
  );
  await app.close();
});

test(
  'I03: OFF observes both sides, ON never replays; manual literal text works in either mode',
  { timeout: 10000 },
  async (t) => {
    const f = await fixture(t);
    await f.command('listen');
    const c = await f.client();
    const clientReceived = [];
    c.on('message', (data) => clientReceived.push(data.toString()));
    await f.command('connect');
    await wait(() => f.app.state.server === 'connected');
    assert.equal(f.app.state.autoForward, true);
    await f.command('set-auto-forward', { enabled: false });
    c.send('paused-client');
    f.peer.send('paused-server');
    await wait(
      () =>
        f.app.history.entries.filter((e) => e.text.startsWith('paused-'))
          .length === 2,
    );
    assert.deepEqual(f.received, []);
    assert.deepEqual(clientReceived, []);
    assert.ok(
      f.app.history.entries
        .filter((e) => e.text.startsWith('paused-'))
        .every((e) => e.reason === 'Автопересылка выключена'),
    );
    for (const enabled of [false, true]) {
      await f.command('set-auto-forward', { enabled });
      for (const target of ['server', 'client'])
        for (const text of ['', ' ', '🙂\n<b>literal</b>']) {
          const clientBefore = clientReceived.length;
          const before =
            target === 'server' ? f.received.length : clientReceived.length;
          await f.command('send', { target, text });
          const out = target === 'server' ? f.received : clientReceived;
          await wait(() => out.length > before);
          assert.equal(out[before], text);
          if (target === 'server' && enabled) {
            await wait(() => clientReceived.length > clientBefore);
            assert.equal(clientReceived[clientBefore], text);
          }
          await wait(() =>
            f.app.history.entries.some(
              (e) =>
                e.side === 'user' &&
                e.target === target &&
                e.text === text &&
                e.status === 'Передано на отправку',
            ),
          );
        }
    }
    const echoed = once(c, 'message');
    c.send('live-after-manual');
    assert.equal((await echoed)[0].toString(), 'live-after-manual');
    assert.equal(f.received.includes('paused-client'), false);
    assert.equal(clientReceived.includes('paused-server'), false);
    const manual = f.app.history.entries.filter((e) => e.side === 'user');
    assert.equal(manual.length, 12);
    assert.deepEqual(
      manual.map((e) => e.id),
      manual.map((e) => e.id).sort((a, b) => a - b),
    );
    await f.command('disconnect-server');
    const count = f.app.history.entries.length;
    await assert.rejects(
      f.command('send', { target: 'server', text: 'missing' }),
      /Получатель/,
    );
    assert.equal(f.app.history.entries.length, count);
    const reply = once(c, 'message');
    await f.command('send', { target: 'client', text: 'one-side' });
    assert.equal((await reply)[0].toString(), 'one-side');
  },
);

test('I03: captured manual target, late failure, clear/eviction and shutdown do not resurrect or retarget', async () => {
  const sent = [],
    callbacks = [];
  let available = true,
    generation = 1;
  const port = {
    target: () =>
      available
        ? {
            send: (text, done) => {
              sent.push({ generation, text });
              callbacks.push(done);
            },
          }
        : undefined,
    close: async () => {},
  };
  const app = new Application(port);
  const command = (action, extra = {}) =>
    app.command({
      id: crypto.randomUUID(),
      instance: app.state.instance,
      action,
      ...extra,
    });
  await command('send', { target: 'server', text: 'in-flight' });
  await command('set-auto-forward', { enabled: false });
  assert.equal(sent.length, 1);
  generation = 2;
  const first = app.history.entries[0];
  callbacks.shift()(new Error('socket closed'));
  assert.equal(first.status, 'Результат неизвестен');
  assert.equal(sent[0].generation, 1);
  await command('send', { target: 'client', text: 'clear-me' });
  const id = app.history.entries.at(-1).id;
  await command('clear', { shown: [id] });
  callbacks.shift()();
  assert.equal(
    app.history.entries.some((e) => e.id === id),
    false,
  );
  await command('send', { target: 'server', text: 'evict-me' });
  const evicted = app.history.entries.at(-1).id;
  for (let i = 0; i < 1001; i++)
    app.history.add({ session: 0, side: 'event', text: String(i), status: '' });
  callbacks.shift()();
  assert.equal(
    app.history.entries.some((e) => e.id === evicted),
    false,
  );
  available = false;
  await assert.rejects(
    command('send', { target: 'client', text: 'no-target' }),
    /Получатель/,
  );
  await assert.rejects(
    app.command({
      id: 'stale',
      instance: 'other',
      action: 'send',
      target: 'server',
      text: 'stale',
    }),
    /устарело/,
  );
  available = true;
  await command('send', { target: 'server', text: 'shutdown' });
  const pending = app.history.entries.at(-1);
  await app.close();
  callbacks.shift()();
  assert.equal(pending.status, 'Ожидает отправки');
});

test('I03: AppModel suppresses double submit and never retries an uncertain manual send', () => {
  const model = new AppModel(() => {}),
    sent = [];
  const transport = { send: (text) => sent.push(JSON.parse(text)), close() {} };
  const app = new Application({});
  model.connected(transport);
  model.receive({
    type: 'snapshot',
    state: structuredClone(app.state),
    entries: [],
  });
  model.sendMessage('server', 'draft');
  model.sendMessage('server', 'draft');
  assert.equal(sent.length, 1);
  assert.equal(model.pendingHas('send'), true);
  model.disconnected();
  assert.match(model.error, /неизвестен/);
  model.connected(transport);
  model.receive({
    type: 'snapshot',
    state: structuredClone(app.state),
    entries: [],
  });
  assert.equal(sent.length, 1);
  assert.equal(model.pendingHas('send'), false);
  model.setAutoForward(false);
  assert.deepEqual(
    { action: sent[1].action, enabled: sent[1].enabled },
    { action: 'set-auto-forward', enabled: false },
  );
});

test('I03: live forwarding and manual sending progress independently of pending callbacks', async () => {
  const sent = [],
    callbacks = [];
  const port = {
    target: (side) => ({
      send: (text, done) => {
        sent.push({ side, text });
        callbacks.push(done);
      },
    }),
    close: async () => {},
  };
  const app = new Application(port);
  await app.command({
    id: 'manual',
    instance: app.state.instance,
    action: 'send',
    target: 'server',
    text: 'manual pending',
  });
  port.events.text('client', 'live concurrent', 1, 15);
  assert.deepEqual(sent, [
    { side: 'server', text: 'manual pending' },
    { side: 'server', text: 'live concurrent' },
  ]);
  callbacks[1]();
  callbacks[0]();
  assert.deepEqual(
    app.history.entries.map((e) => e.text),
    ['manual pending', 'live concurrent'],
  );
  assert.ok(
    app.history.entries.every((e) => e.status === 'Передано на отправку'),
  );
  await app.close();
});
