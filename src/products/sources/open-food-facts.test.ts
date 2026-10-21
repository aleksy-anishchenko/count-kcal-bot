import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOpenFoodFactsProduct } from './open-food-facts.ts';

// Реальный ответ базы на 4810268031793 (сокращён до нужных полей).
const yogurt = {
  status: 1,
  product: {
    product_name_ru: 'Греческий йогурт Натуральный 2%',
    product_name: 'Greek yogurt',
    brands: 'Teos, Савушкин',
    quantity: '250 г',
    ingredients_text_ru: 'Молоко, закваска',
    nutriments: { 'energy-kcal_100g': 66.8, proteins_100g: 8, fat_100g: 2, carbohydrates_100g: 4.2 },
  },
};

test('товар с полными данными: русское название, первый бренд, числа на 100 г, ссылка', () => {
  assert.deepEqual(parseOpenFoodFactsProduct('4810268031793', yogurt), {
    barcode: '4810268031793',
    name: 'Teos Греческий йогурт Натуральный 2%',
    quantity: '250 г',
    composition: 'Молоко, закваска',
    kcal100: 66.8, protein100: 8, fat100: 2, carbs100: 4.2,
    nutritionEstimated: false,
    origin: 'off',
    link: 'https://world.openfoodfacts.org/product/4810268031793',
  });
});

test('status 0 (товара нет) → null', () => {
  assert.equal(parseOpenFoodFactsProduct('1', { status: 0, status_verbose: 'product not found' }), null);
});

test('без калорий — товар всё равно полезен: название есть, числа все null', () => {
  const noKcal = { status: 1, product: { product_name: 'x', nutriments: { proteins_100g: 1 } } };
  const p = parseOpenFoodFactsProduct('1', noKcal);
  assert.equal(p?.name, 'x');
  assert.equal(p?.kcal100, null);
  assert.equal(p?.protein100, null); // БЖУ без калорий не нужны
});

test('бренд не дублируется, если уже есть в названии; числа строками; нет БЖУ → null', () => {
  const nutella = {
    status: 1,
    product: { product_name: 'Nutella', brands: 'Nutella, Ferrero', quantity: '400 g e', nutriments: { 'energy-kcal_100g': '539' } },
  };
  const p = parseOpenFoodFactsProduct('3017620422003', nutella);
  assert.equal(p?.name, 'Nutella');
  assert.equal(p?.kcal100, 539);
  assert.equal(p?.protein100, null);
  assert.equal(p?.composition, null);
});

test('мусор или без названия → null', () => {
  assert.equal(parseOpenFoodFactsProduct('1', null), null);
  assert.equal(parseOpenFoodFactsProduct('1', 'x'), null);
  assert.equal(parseOpenFoodFactsProduct('1', {}), null);
  assert.equal(parseOpenFoodFactsProduct('1', { status: 1, product: { nutriments: { 'energy-kcal_100g': 10 } } }), null);
});
