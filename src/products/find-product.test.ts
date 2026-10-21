import { after, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { closeDb } from '../db/connection.ts';
import { cacheProduct } from '../db/product-cache.ts';
import { findProduct } from './find-product.ts';
import { yogurt } from './test-fixtures.ts';

after(() => closeDb());
mock.method(console, 'warn', () => {});

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date('2026-10-22T12:00:00Z');

// Open Food Facts знает йогурт под новым названием, Роскачество — ничего.
let databasesDown = false;
let requests = 0;
mock.method(globalThis, 'fetch', async (url: string) => {
  requests++;
  if (databasesDown) throw new TypeError('fetch failed');
  if (url.startsWith('https://world.openfoodfacts.org')) {
    return Response.json({ status: 1, product: { product_name: 'Йогурт обновлённый', nutriments: { 'energy-kcal_100g': 70 } } });
  }
  return Response.json({ response: {}, message: [] });
});
beforeEach(() => {
  databasesDown = false;
  requests = 0;
});

test('свежий кэш: базы не спрашиваем', async () => {
  cacheProduct({ ...yogurt, barcode: '1' }, new Date(now.getTime() - 10 * DAY_MS));
  assert.equal((await findProduct('1', now))?.name, yogurt.name);
  assert.equal(requests, 0);
});

test('кэш старше 90 дней: спрашиваем базы и обновляем', async () => {
  cacheProduct({ ...yogurt, barcode: '2' }, new Date(now.getTime() - 91 * DAY_MS));
  assert.equal((await findProduct('2', now))?.name, 'Йогурт обновлённый');
  assert.equal(requests, 1);
  assert.equal((await findProduct('2', now))?.name, 'Йогурт обновлённый');
  assert.equal(requests, 1);
});

test('кэш старше 90 дней, базы недоступны: отдаём устаревший, а не null', async () => {
  cacheProduct({ ...yogurt, barcode: '3' }, new Date(now.getTime() - 91 * DAY_MS));
  databasesDown = true;
  assert.equal((await findProduct('3', now))?.name, yogurt.name);
});
