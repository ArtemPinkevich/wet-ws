import test from 'node:test';
import assert from 'node:assert/strict';
import { Templates } from '../../dist/frontend/library-ui/templates.js';
import { History } from '../../dist/backend/history/history.js';
import { isEntry } from '../../dist/backend/history/history.protocol.js';
import { applyTextareaEdit } from '../../dist/frontend/message-ui/message-ui.js';

test('I05: mutations use fresh IDs, retain literal records and free capacity', () => {
  let raw = null;
  const storage = {
    getItem: () => raw,
    setItem: (_key, value) => {
      raw = value;
    },
  };
  const first = new Templates(() => storage);
  const a = first.save('same', 'a\r\nb\rc\n');
  const b = first.save('same', '<b>literal</b>');
  const second = new Templates(() => storage);
  const c = second.save('third', '');
  assert.equal(first.reorder(a.id, c.id, true), true);
  assert.deepEqual(first.items, [b, c, a]);
  assert.equal(second.move(a.id, -1), true);
  assert.deepEqual(second.items, [b, a, c]);
  assert.equal(second.move(b.id, -1), false);
  assert.equal(first.remove(a.id), true);
  assert.equal(second.remove(a.id), false);
  assert.throws(() => first.move(a.id, 1), /удалена/);
  assert.throws(() => first.reorder(b.id, a.id, true), /удалена/);
  assert.deepEqual(new Templates(() => storage).items, [b, c]);
  for (let i = 2; i < 20; i++) first.save(String(i), '');
  first.remove(b.id);
  first.save('space freed', 'literal');
  assert.equal(first.items.length, 20);
  for (const item of [...first.items]) first.remove(item.id);
  assert.deepEqual(new Templates(() => storage).items, []);
});

test('I05: failed mutations preserve stored and displayed records', () => {
  let raw = null,
    fail = false;
  const storage = {
    getItem: () => raw,
    setItem: (_key, value) => {
      if (fail) throw new Error('QuotaExceededError');
      raw = value;
    },
  };
  const library = new Templates(() => storage);
  const a = library.save('same', 'a\r\n'),
    b = library.save('same', 'b');
  const saved = raw;
  fail = true;
  for (const operation of [
    () => library.remove(a.id),
    () => library.move(a.id, 1),
    () => library.reorder(a.id, b.id, true),
  ]) {
    assert.throws(operation, /Quota/);
    assert.equal(raw, saved);
    assert.deepEqual(library.items, [a, b]);
  }
  fail = false;
  raw = '{';
  assert.throws(() => library.remove(a.id));
  assert.throws(() => library.move(a.id, 1));
  assert.throws(() => library.reorder(a.id, b.id, true));
  assert.equal(raw, '{');
  assert.deepEqual(library.items, [a, b]);
});

test('I04: textarea edits preserve source CR/CRLF in untouched lines', () => {
  const raw = 'a\r\nb\rc\n';
  assert.equal(applyTextareaEdit(raw, 'a\nb\nc\n'), raw);
  assert.equal(applyTextareaEdit(raw, 'a\nB\nc\n'), 'a\r\nB\rc\n');
  assert.equal(applyTextareaEdit(raw, 'Xa\nb\nc\n'), 'Xa\r\nb\rc\n');
  assert.equal(applyTextareaEdit(raw, 'a\nc\n'), 'a\r\nc\n');
});

test('I04: literal templates persist; a fresh reader sees writes; 21st item is rejected', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const first = new Templates(() => storage);
  const raw = '  🙂 <script>alert(1)</script>\n{"a":1}  ';
  first.save('  literal name  ', raw);
  const second = new Templates(() => storage);
  assert.equal(second.items[0].text, raw);
  assert.equal(second.items[0].name, '  literal name  ');
  for (let i = 1; i < 20; i++) second.save(String(i), '');
  const snapshot = [...values];
  assert.throws(() => first.save('21', 'text'), /20/);
  assert.deepEqual([...values], snapshot);
  first.reload();
  assert.equal(first.items.length, 20);
});

test('I04: quota/corruption/security failures never report a save or overwrite stored data', () => {
  let raw = null,
    fail = false;
  const storage = {
    getItem: () => raw,
    setItem: (_key, value) => {
      if (fail) throw new Error('QuotaExceededError');
      raw = value;
    },
  };
  const library = new Templates(() => storage);
  library.save('saved', 'original');
  const saved = raw;
  fail = true;
  assert.throws(() => library.save('lost', 'draft'), /Quota/);
  assert.equal(library.items.length, 1);
  assert.equal(raw, saved);
  fail = false;
  for (const corrupt of [
    '{',
    '{"version":2,"items":[]}',
    '{"version":1,"items":[{"id":"x","name":"n","text":"t"},{"id":"x","name":"n","text":"t"}]}',
  ]) {
    raw = corrupt;
    library.reload();
    assert.ok(library.error);
    assert.equal(library.items[0].text, 'original');
    assert.throws(() => library.save('new', 'new'));
    assert.equal(raw, corrupt);
  }
  assert.ok(
    new Templates(() => {
      throw new Error('SecurityError');
    }).error,
  );
});

test('I04: missing payload has an explicit validated marker; identical literal text is usable', () => {
  const history = new History(10, 500);
  const oversized = history.add({
    session: 1,
    side: 'client',
    text: 'x'.repeat(1000),
    status: 'observed',
  }).entry;
  assert.equal(oversized.payloadUnavailable, true);
  assert.equal(isEntry(oversized), true);
  assert.equal(isEntry({ ...oversized, payloadUnavailable: 'true' }), false);
  const literal = history.add({
    session: 1,
    side: 'server',
    text: oversized.text,
    status: 'observed',
  }).entry;
  assert.equal(literal.payloadUnavailable, undefined);
  assert.equal(literal.text, oversized.text);
});
