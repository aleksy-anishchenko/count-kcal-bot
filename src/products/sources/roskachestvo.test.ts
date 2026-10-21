import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNutritionText, parseRoskachestvoCard } from './roskachestvo.ts';

// Четыре формата текста, встреченные в реальных карточках 2026-10-21.
test('parseNutritionText: «белки - 16,0 г, жиры - 5,0 г. углеводы - 3,0 г, калорийность - 120 ккал»', () => {
  const t = 'Пищевая ценность (средние значения) 100 г продукта: белки - 16,0 г, жиры - 5,0 г. углеводы - 3,0 г, калорийность - 120 ккал, энергетическая ценность - 510 кДж.';
  assert.deepEqual(parseNutritionText(t), { kcal: 120, protein: 16, fat: 5, carbs: 3 });
});

test('parseNutritionText: «белок», «жир», «630 кДж/150 ккал»', () => {
  const t = 'Пищевая ценность в 100 г продукта (средние значения): белок - 13,0 г, жир - 11,0 г, углеводы 0,5 г, калорийность - 630 кДж/150 ккал';
  assert.deepEqual(parseNutritionText(t), { kcal: 150, protein: 13, fat: 11, carbs: 0.5 });
});

test('parseNutritionText: «354 ккал/1480 кДж», порядок полей другой, углеводов нет', () => {
  const t = 'Пищевая ценность 100 г (средние значения): жир 28,5 г, белок 24,5 г. Энергетическая ценность (калорийность) 100 г (средние значения): 354 ккал/1480 кДж';
  assert.deepEqual(parseNutritionText(t), { kcal: 354, protein: 24.5, fat: 28.5, carbs: null });
});

test('parseNutritionText: калорий в тексте нет — считаем из БЖУ; «жирные кислоты» не путаем с жирами', () => {
  const t = 'Пищевая ценность в 100г продукта (средние значения): белки- 7,0г; жиры- 32,0г (в том числе насыщенные жирные кислоты- 18,3); углеводы- 56,0; пищевые волокна- 2,3г';
  // 4·7 + 9·32 + 4·56 = 540
  assert.deepEqual(parseNutritionText(t), { kcal: 540, protein: 7, fat: 32, carbs: 56 });
});

test('parseNutritionText: пусто или без чисел → null', () => {
  assert.equal(parseNutritionText(''), null);
  assert.equal(parseNutritionText('Пищевая ценность соответствует маркировке.'), null);
});

// Реальный ответ на 4607003723705, сокращён до нужных полей.
const cottageCheese = {
  response: {
    id: 3848611,
    title: 'Творог с массовой долей жира 5%, «Светаево» ',
    total_rating: 4.8071,
    product_link: 'https://rskrf.ru/goods/tvorog-s-massovoy-doley-zhira-5-svetaevo-/',
    product_info: [
      { name: 'Производитель', info: 'ООО "БАЛТКОМ ЮНИ"' },
      { name: 'Год исследования', info: '2024' },
      { name: 'Дополнительная информация', info: 'Пищевая ценность (средние значения) 100 г продукта: белки - 16,0 г, жиры - 5,0 г. углеводы - 3,0 г, калорийность - 120 ккал, энергетическая ценность - 510 кДж.' },
      { name: 'Состав', info: 'Молоко, закваска.' },
      { name: 'Вес', info: '300 г' },
      { name: 'Штрихкоды', info: '4607003723705' },
    ],
  },
};

test('parseRoskachestvoCard: название, вес, состав, КБЖУ из текста, ссылка', () => {
  assert.deepEqual(parseRoskachestvoCard('4607003723705', cottageCheese), {
    barcode: '4607003723705',
    name: 'Творог с массовой долей жира 5%, «Светаево»',
    quantity: '300 г',
    composition: 'Молоко, закваска.',
    kcal100: 120, protein100: 16, fat100: 5, carbs100: 3,
    nutritionEstimated: false,
    origin: 'rskrf',
    link: 'https://rskrf.ru/goods/tvorog-s-massovoy-doley-zhira-5-svetaevo-/',
  });
});

test('parseRoskachestvoCard: карточка без пищевой ценности — только название и вес', () => {
  const yogurt = { response: { title: 'Йогурт «клубника» 3% «Талицкий»', product_link: 'https://rskrf.ru/goods/x/', product_info: [{ name: 'Вес', info: '125 г' }] } };
  const p = parseRoskachestvoCard('1', yogurt);
  assert.equal(p?.name, 'Йогурт «клубника» 3% «Талицкий»');
  assert.equal(p?.quantity, '125 г');
  assert.equal(p?.kcal100, null);
  assert.equal(p?.composition, null);
});

test('parseRoskachestvoCard: товара нет → null', () => {
  assert.equal(parseRoskachestvoCard('1', { response: {}, message: [] }), null);
  assert.equal(parseRoskachestvoCard('1', null), null);
  assert.equal(parseRoskachestvoCard('1', 'x'), null);
});
