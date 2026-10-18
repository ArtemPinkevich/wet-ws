import test from 'node:test';
import assert from 'node:assert/strict';
import { EchoController } from '../../../dist/legacy/iteration-01/controller.js';
import {
  CONNECT_TIMEOUT_MS,
  REPLY_TIMEOUT_MS,
  MAX_PAYLOAD_BYTES,
} from '../../../dist/legacy/iteration-01/limits.js';

class FakeClock {
  time = 0;
  timers = new Map();
  nextId = 1;
  now = () => this.time;
  setTimeout = (callback, delay) => {
    const id = this.nextId++;
    this.timers.set(id, { callback, at: this.time + delay });
    return id;
  };
  clearTimeout = (id) => {
    this.timers.delete(id);
  };
  advance(ms) {
    const end = this.time + ms;
    for (;;) {
      const next = [...this.timers.entries()]
        .sort((a, b) => a[1].at - b[1].at)
        .find(([, timer]) => timer.at <= end);
      if (!next) break;
      const [id, timer] = next;
      this.time = timer.at;
      this.timers.delete(id);
      timer.callback();
    }
    this.time = end;
  }
  jumpWithoutTimers(ms) {
    this.time += ms;
  }
}

function fixture({ throwOnConnect = false } = {}) {
  const clock = new FakeClock();
  const sockets = [];
  const changes = [];
  const controller = new EchoController({
    clock,
    onChange: (state) => changes.push(state),
    createConnection(events) {
      if (throwOnConnect) throw new Error('construction failed');
      const socket = {
        events,
        sent: [],
        closes: 0,
        throwOnSend: false,
        onSend: null,
        send(text) {
          if (this.throwOnSend) throw new Error('send failed');
          this.sent.push(text);
          this.onSend?.(text);
        },
        close() {
          this.closes++;
          events.closed();
        },
      };
      sockets.push(socket);
      return socket;
    },
  });
  controller.start();
  return {
    controller,
    clock,
    sockets,
    changes,
    get socket() {
      return sockets.at(-1);
    },
  };
}

function connected() {
  const f = fixture();
  f.socket.events.opened();
  return f;
}

test('opens automatically without sending, and ignores repeated starts', () => {
  const { controller, socket, sockets, clock } = fixture();
  assert.equal(controller.state.connection, 'connecting');
  assert.equal(controller.state.result, 'idle');
  controller.start();
  controller.send();
  assert.equal(sockets.length, 1);
  assert.deepEqual(socket.sent, []);
  socket.events.opened();
  assert.equal(controller.state.connection, 'ready');
  clock.advance(CONNECT_TIMEOUT_MS * 2);
  assert.equal(controller.state.connection, 'ready');
  assert.equal(clock.timers.size, 0);
});

for (const text of [
  '',
  ' ',
  'Привет, WebSocket!',
  '  первая\nвторая\n',
  '<b>тест</b>',
  '😀\t漢字',
]) {
  test(`literal text is sent and actual text returned: ${JSON.stringify(text)}`, () => {
    const { controller, socket } = connected();
    controller.setInput(text);
    controller.send();
    assert.equal(controller.state.result, 'waiting');
    assert.equal(controller.state.reply, null);
    assert.deepEqual(socket.sent, [text]);
    controller.send();
    controller.setInput('editing while waiting');
    assert.equal(controller.state.input, text);
    assert.deepEqual(socket.sent, [text]);
    socket.events.received(text);
    assert.equal(controller.state.result, 'received');
    assert.equal(controller.state.reply, text);
    assert.equal(controller.state.input, text);
    assert.equal(controller.state.connection, 'ready');
    socket.events.received('unsolicited');
    assert.equal(controller.state.reply, text);
  });
}

test('mismatch shows the actual received text, retains connection and allows new send', () => {
  const { controller, socket } = connected();
  controller.setInput('sent');
  controller.send();
  socket.events.received('actual');
  assert.equal(controller.state.result, 'mismatch');
  assert.equal(controller.state.reply, 'actual');
  assert.equal(socket.closes, 0);
  controller.setInput('changed');
  assert.equal(controller.state.previousReply, true);
  assert.equal(controller.state.result, 'mismatch');
  controller.send();
  assert.equal(controller.state.reply, null);
  assert.equal(controller.state.result, 'waiting');
  socket.events.received('changed');
  assert.equal(controller.state.result, 'received');
  assert.equal(controller.state.previousReply, false);
  assert.deepEqual(socket.sent, ['sent', 'changed']);
});

test('editing or disconnection marks a completed answer as previous without hiding it', () => {
  const f = connected();
  f.controller.setInput('answer');
  f.controller.send();
  f.socket.events.received('answer');
  assert.equal(f.controller.state.previousReply, false);
  f.socket.events.closed();
  assert.equal(f.controller.state.previousReply, true);
  assert.equal(f.controller.state.reply, 'answer');
  assert.equal(f.controller.state.result, 'received');
  f.controller.reconnect();
  f.socket.events.opened();
  assert.equal(f.controller.state.reply, 'answer');
  assert.deepEqual(f.socket.sent, []);
  f.controller.setInput('new answer');
  assert.equal(f.controller.state.previousReply, true);
});

for (const text of [
  'a',
  'a'.repeat(MAX_PAYLOAD_BYTES),
  'я'.repeat(MAX_PAYLOAD_BYTES / 2),
  '😀'.repeat(MAX_PAYLOAD_BYTES / 4),
]) {
  test(`accepts UTF-8 byte boundary ${new TextEncoder().encode(text).byteLength}, first code point ${text.codePointAt(0)}`, () => {
    const { controller, socket } = connected();
    controller.setInput(text);
    controller.send();
    assert.equal(controller.state.validationError, null);
    assert.deepEqual(socket.sent, [text]);
  });
}

for (const text of [
  'a'.repeat(MAX_PAYLOAD_BYTES + 1),
  'я'.repeat(MAX_PAYLOAD_BYTES / 2) + 'a',
  '😀'.repeat(MAX_PAYLOAD_BYTES / 4) + 'a',
]) {
  test(`rejects 65537 UTF-8 bytes without losing previous reply, first code point ${text.codePointAt(0)}`, () => {
    const { controller, socket } = connected();
    controller.setInput('previous');
    controller.send();
    socket.events.received('previous');
    controller.setInput(text);
    controller.send();
    assert.equal(controller.state.input, text);
    assert.equal(controller.state.result, 'received');
    assert.equal(controller.state.reply, 'previous');
    assert.equal(controller.state.previousReply, true);
    assert.match(controller.state.validationError, /64 КиБ/);
    assert.deepEqual(socket.sent, ['previous']);
    controller.setInput('short');
    assert.equal(controller.state.validationError, null);
    controller.send();
    assert.equal(controller.state.reply, null);
    assert.deepEqual(socket.sent, ['previous', 'short']);
  });
}

test('connection waits at 4999 ms, ends at 5000 ms, ignores late open', () => {
  const { controller, socket, clock } = fixture();
  controller.setInput('preserved');
  clock.advance(CONNECT_TIMEOUT_MS - 1);
  assert.equal(controller.state.connection, 'connecting');
  clock.advance(1);
  assert.equal(controller.state.connection, 'disconnected');
  assert.equal(controller.state.resultError, 'Истекло время подключения');
  assert.equal(controller.state.input, 'preserved');
  assert.equal(socket.closes, 1);
  socket.events.opened();
  assert.equal(controller.state.connection, 'disconnected');
});

test('connection arriving at deadline before the timer is also too late', () => {
  const { controller, socket, clock } = fixture();
  clock.jumpWithoutTimers(CONNECT_TIMEOUT_MS);
  socket.events.opened();
  assert.equal(controller.state.connection, 'disconnected');
  assert.equal(controller.state.resultError, 'Истекло время подключения');
});

test('connection arriving just before the deadline succeeds', () => {
  const { controller, socket, clock } = fixture();
  clock.advance(CONNECT_TIMEOUT_MS - 1);
  socket.events.opened();
  clock.advance(1);
  assert.equal(controller.state.connection, 'ready');
});

test('reply waits at 4999 ms, ends at 5000 ms; reconnect and resend are separate', () => {
  const f = connected();
  f.controller.setInput('preserved');
  f.controller.send();
  const oldSocket = f.socket;
  f.clock.advance(REPLY_TIMEOUT_MS - 1);
  assert.equal(f.controller.state.result, 'waiting');
  f.clock.advance(1);
  assert.equal(f.controller.state.result, 'error');
  assert.equal(f.controller.state.resultError, 'Истекло время ожидания ответа');
  assert.equal(f.controller.state.connection, 'disconnected');
  assert.equal(f.controller.state.reply, null);
  assert.equal(f.controller.state.input, 'preserved');
  assert.equal(oldSocket.closes, 1);
  f.controller.setInput('new request');
  f.controller.reconnect();
  oldSocket.events.opened();
  assert.equal(f.controller.state.connection, 'connecting');
  f.socket.events.opened();
  assert.equal(f.controller.state.resultError, 'Истекло время ожидания ответа');
  assert.deepEqual(f.socket.sent, []);
  f.controller.send();
  oldSocket.events.received('late reply');
  oldSocket.events.failed();
  oldSocket.events.closed();
  assert.equal(f.controller.state.result, 'waiting');
  assert.equal(f.controller.state.connection, 'ready');
  f.socket.events.received('new request');
  assert.equal(f.controller.state.reply, 'new request');
  assert.equal(f.controller.state.result, 'received');
});

test('reply arriving at deadline before the timer is rejected', () => {
  const { controller, socket, clock } = connected();
  controller.send();
  clock.jumpWithoutTimers(REPLY_TIMEOUT_MS);
  socket.events.received('');
  assert.equal(controller.state.resultError, 'Истекло время ожидания ответа');
  assert.equal(controller.state.reply, null);
});

test('reply at 4999 ms succeeds and clears its timer', () => {
  const { controller, socket, clock } = connected();
  controller.send();
  clock.advance(REPLY_TIMEOUT_MS - 1);
  socket.events.received('');
  clock.advance(1);
  assert.equal(controller.state.result, 'received');
  assert.equal(controller.state.reply, '');
  assert.equal(clock.timers.size, 0);
});

test('reply timeout starts after successful send returns', () => {
  const { controller, socket, clock } = connected();
  socket.onSend = () => clock.jumpWithoutTimers(25);
  controller.send();
  clock.advance(REPLY_TIMEOUT_MS - 1);
  assert.equal(controller.state.result, 'waiting');
  clock.advance(1);
  assert.equal(controller.state.resultError, 'Истекло время ожидания ответа');
});

test('send exception after success clears the old result and unlocks input', () => {
  const { controller, socket } = connected();
  controller.setInput('old');
  controller.send();
  socket.events.received('old');
  socket.throwOnSend = true;
  controller.send();
  assert.equal(controller.state.reply, null);
  assert.equal(controller.state.resultError, 'Не удалось отправить текст');
  assert.equal(controller.state.connection, 'disconnected');
  controller.setInput('editable');
  assert.equal(controller.state.input, 'editable');
  assert.equal(socket.closes, 1);
});

for (const [event, message] of [
  ['failed', 'Ошибка соединения'],
  ['closed', 'Соединение закрыто'],
]) {
  test(`${event} during exchange ends attempt and preserves input`, () => {
    const { controller, socket, clock } = connected();
    controller.setInput('saved');
    controller.send();
    socket.events[event]();
    assert.equal(controller.state.resultError, message);
    assert.equal(controller.state.connection, 'disconnected');
    assert.equal(controller.state.input, 'saved');
    assert.equal(controller.state.reply, null);
    assert.equal(clock.timers.size, 0);
  });
}

test('connection construction failure ends connecting state', () => {
  const { controller, clock } = fixture({ throwOnConnect: true });
  assert.equal(controller.state.connection, 'disconnected');
  assert.equal(controller.state.resultError, 'Не удалось подключиться');
  assert.equal(clock.timers.size, 0);
});

test('binary reply is not displayed as a successful text reply', () => {
  const { controller, socket } = connected();
  controller.send();
  socket.events.received(new Uint8Array([1, 2]));
  assert.equal(controller.state.reply, null);
  assert.equal(
    controller.state.resultError,
    'Получен неподдерживаемый формат ответа',
  );
  assert.equal(controller.state.connection, 'disconnected');
});

test('disposing closes once, cancels timers and ignores further callbacks or actions', () => {
  const { controller, socket, clock, changes } = connected();
  controller.send();
  controller.dispose();
  const count = changes.length;
  controller.dispose();
  controller.reconnect();
  controller.send();
  controller.setInput('ignored');
  socket.events.received('ignored');
  socket.events.opened();
  socket.events.closed();
  socket.events.failed();
  clock.advance(REPLY_TIMEOUT_MS);
  assert.equal(socket.closes, 1);
  assert.equal(clock.timers.size, 0);
  assert.equal(changes.length, count);
});
