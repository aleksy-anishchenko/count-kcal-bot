import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pluralize, toTrimmedString, truncate } from './text.ts';

test('toTrimmedString: обрезает пробелы, пустое и не-строку → null', () => {
  assert.equal(toTrimmedString('  йогурт '), 'йогурт');
  assert.equal(toTrimmedString('   '), null);
  assert.equal(toTrimmedString(''), null);
  assert.equal(toTrimmedString(200), null);
  assert.equal(toTrimmedString(undefined), null);
});

test('truncate считает эмодзи одним символом и ставит многоточие', () => {
  assert.equal(truncate('😀😀😀', 2), '😀😀…');
  assert.equal(truncate('abc', 3), 'abc');
  assert.equal(truncate('', 5), '');
});

test('pluralize: 1 запрос, 2 запроса, 5 запросов, 11 запросов, 21 запрос', () => {
  const forms: [string, string, string] = ['запрос', 'запроса', 'запросов'];
  assert.deepEqual([1, 2, 5, 11, 14, 21, 22, 0].map((n) => pluralize(n, forms)),
    ['запрос', 'запроса', 'запросов', 'запросов', 'запросов', 'запрос', 'запроса', 'запросов']);
});
