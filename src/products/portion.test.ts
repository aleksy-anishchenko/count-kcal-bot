import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGrams, recognitionFromProduct } from './portion.ts';
import { yogurt } from './test-fixtures.ts';

test('parseGrams: граммы, килограммы, миллилитры, разные написания', () => {
  assert.equal(parseGrams('съел 150 г'), 150);
  assert.equal(parseGrams('150г'), 150);
  assert.equal(parseGrams('400 g e'), 400);
  assert.equal(parseGrams('0,5 кг'), 500);
  assert.equal(parseGrams('330 мл'), 330);
  assert.equal(parseGrams('200 граммов'), 200);
  assert.equal(parseGrams('500 гр.'), 500);
  assert.equal(parseGrams('930 г, 900 мл'), 930);
  assert.equal(parseGrams('1 л'), 1000);
});

test('parseGrams: без граммов → null', () => {
  assert.equal(parseGrams('съел половину'), null);
  assert.equal(parseGrams('2 шт'), null);
  assert.equal(parseGrams('0 г'), null);
  assert.equal(parseGrams(null), null);
  assert.equal(parseGrams(undefined), null);
});

test('recognitionFromProduct: граммы из подписи', () => {
  const recognition = recognitionFromProduct(yogurt, 'съел 150 г');
  assert.deepEqual(recognition.food, [{ name: 'Teos Греческий йогурт', amount: '150 г', kcal: 100, protein: 12, fat: 3, carbs: 6.3 }]);
  assert.equal(recognition.source, 'barcode');
  assert.equal(recognition.barcode, '4810268031793');
});

test('recognitionFromProduct: без подписи — вся упаковка', () => {
  const recognition = recognitionFromProduct(yogurt, undefined);
  assert.deepEqual(recognition.food[0], { name: 'Teos Греческий йогурт', amount: 'вся упаковка, 250 г', kcal: 167, protein: 20, fat: 5, carbs: 10.5 });
});

test('recognitionFromProduct: калории оценила нейросеть — source «name», а не «barcode»', () => {
  const recognition = recognitionFromProduct({ ...yogurt, nutritionEstimated: true }, undefined);
  assert.equal(recognition.source, 'name');
});

test('recognitionFromProduct: вес упаковки неизвестен — 100 г с пометкой; null-БЖУ остаются null', () => {
  const recognition = recognitionFromProduct({ ...yogurt, quantity: null, protein100: null }, undefined);
  assert.deepEqual(recognition.food[0], { name: 'Teos Греческий йогурт', amount: '100 г (порция не указана)', kcal: 67, protein: null, fat: 2, carbs: 4.2 });
});
