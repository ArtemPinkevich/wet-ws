import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkJsonSyntax,
  jsonErrorPosition,
} from '../../dist/frontend/message-ui/json-syntax.js';

test('JSON syntax accepts every root value and keeps whitespace-only neutral', () => {
  for (const text of [
    '{}',
    '[]',
    '"hello"',
    '42',
    '-1.2e3',
    'true',
    'false',
    'null',
  ])
    assert.equal(checkJsonSyntax(text).kind, 'valid', text);
  for (const text of ['', ' \r\n\t'])
    assert.equal(checkJsonSyntax(text).kind, 'neutral');
  for (const text of [
    '{"a":1,}',
    '[1,]',
    '{',
    '"unterminated',
    'plain text',
    '"a\nb"',
  ])
    assert.equal(checkJsonSyntax(text).kind, 'invalid', text);
});

test('error location respects browser evidence, line endings, EOF and bounds', () => {
  assert.deepEqual(
    jsonErrorPosition('{\n}', 'Unexpected token at position 2'),
    {
      line: 2,
      column: 1,
    },
  );
  assert.deepEqual(
    jsonErrorPosition('{\r\n}', 'Unexpected token at position 3'),
    {
      line: 2,
      column: 1,
    },
  );
  assert.deepEqual(
    jsonErrorPosition('{\r}', 'Unexpected token at position 2'),
    {
      line: 2,
      column: 1,
    },
  );
  assert.deepEqual(jsonErrorPosition('{', 'Unexpected token at position 1'), {
    line: 1,
    column: 2,
  });
  assert.deepEqual(
    jsonErrorPosition(
      '{\n}',
      'Unexpected token at position 2 (line 2 column 1)',
    ),
    {
      line: 2,
      column: 1,
    },
  );
  for (const message of [
    'Unexpected end of JSON input',
    'line 0 column 1',
    'line 3 column 1',
    'line 1 column 99',
    'Unexpected token at position 100',
    'Unexpected token at position 9007199254740993',
  ])
    assert.equal(jsonErrorPosition('{\n}', message), null, message);
});

test('quoted payload cannot impersonate parser location metadata', () => {
  for (const text of ['line 2 column 1\nxx', 'position 3', 'at position 1']) {
    const result = checkJsonSyntax(text);
    assert.equal(result.kind, 'invalid');
    assert.equal(result.line, null, text);
    assert.equal(result.column, null, text);
  }
  assert.equal(
    jsonErrorPosition(
      'position 3',
      `Unexpected token 'p', "position 3" is not valid JSON`,
    ),
    null,
  );
});
