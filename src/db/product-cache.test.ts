import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Product } from '../products/product.ts';
import { closeDb } from './connection.ts';
import { cacheProduct, getCachedProduct, saveNutritionEstimate } from './product-cache.ts';

after(() => closeDb());

test('кэш товаров: нет → null, после cacheProduct есть, повтор обновляет', () => {
  const product: Product = {
    barcode: '4810268031793', name: 'Йогурт', quantity: '250 г', composition: null,
    kcal100: 66.8, protein100: 8, fat100: null, carbs100: 4.2, nutritionEstimated: false, origin: 'off', link: null,
  };
  assert.equal(getCachedProduct(product.barcode), null);
  cacheProduct(product, new Date('2026-10-01T00:00:00Z'));
  // Строки node:sqlite — без прототипа, а строгое deepEqual сравнивает и его; spread убирает разницу.
  const cached = getCachedProduct(product.barcode);
  assert.deepEqual({ ...cached?.product }, product);
  assert.equal(cached?.fetchedAt.toISOString(), '2026-10-01T00:00:00.000Z');
  cacheProduct({ ...product, name: 'Йогурт 2' });
  assert.equal(getCachedProduct(product.barcode)?.product.name, 'Йогурт 2');
});

test('кэш товаров: товар без калорий, потом оценка нейросети — флаг и числа, дата скачивания та же', () => {
  const productWithoutNutrition: Product = {
    barcode: '1', name: 'Йогурт', quantity: '250 г', composition: null,
    kcal100: null, protein100: null, fat100: null, carbs100: null, nutritionEstimated: false,
    origin: 'rskrf', link: 'https://rskrf.ru/goods/x/',
  };
  cacheProduct(productWithoutNutrition, new Date('2026-10-01T00:00:00Z'));
  assert.deepEqual({ ...getCachedProduct('1')?.product }, productWithoutNutrition);

  saveNutritionEstimate({ ...productWithoutNutrition, kcal100: 80, protein100: 3, fat100: 3, carbs100: 10, nutritionEstimated: true });
  const cached = getCachedProduct('1');
  assert.equal(cached?.product.kcal100, 80);
  assert.equal(cached?.product.nutritionEstimated, true);
  assert.equal(cached?.fetchedAt.toISOString(), '2026-10-01T00:00:00.000Z');
});
