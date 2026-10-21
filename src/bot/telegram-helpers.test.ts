import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MESSAGE_MAX_LENGTH, splitMessage } from './telegram-helpers.ts';

test('пустой текст — ни одного сообщения', () => {
  assert.deepEqual(splitMessage(''), []);
});

test('короткий текст не режется', () => {
  assert.deepEqual(splitMessage('привет\nмир'), ['привет\nмир']);
});

test('две строки, вместе длиннее лимита, — режем по переводу строки', () => {
  const a = 'a'.repeat(MESSAGE_MAX_LENGTH - 10);
  const b = 'b'.repeat(20);
  assert.deepEqual(splitMessage(`${a}\n${b}`), [a, b]);
});

test('одна строка длиннее лимита режется «по живому»', () => {
  const s = 'a'.repeat(MESSAGE_MAX_LENGTH + 5);
  assert.deepEqual(splitMessage(s), ['a'.repeat(MESSAGE_MAX_LENGTH), 'aaaaa']);
});

test('эмодзи на границе куска не режется пополам', () => {
  // '😀' — суррогатная пара на позициях MESSAGE_MAX_LENGTH-1 и MESSAGE_MAX_LENGTH.
  const s = `${'a'.repeat(MESSAGE_MAX_LENGTH - 1)}😀b`;
  const chunks = splitMessage(s);
  assert.deepEqual(chunks, ['a'.repeat(MESSAGE_MAX_LENGTH - 1), '😀b']);
  for (const chunk of chunks) {
    assert.ok(chunk.length <= MESSAGE_MAX_LENGTH);
    assert.ok(!/[\ud800-\udbff]$/.test(chunk));
  }
});
