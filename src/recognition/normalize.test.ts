import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRecognition } from './normalize.ts';

test('числа строками: «1 200», «9,5», «1,200», «260 ккал»', () => {
  const { food } = normalizeRecognition({ food: [{ name: 'x', kcal: '1 200', protein: '9,5', fat: '1,200', carbs: '260 ккал' }] });
  assert.deepEqual(food, [{ name: 'x', amount: null, kcal: 1200, protein: 9.5, fat: 1200, carbs: 260 }]);
});

test('отрицательное число и не-число → null', () => {
  const { food } = normalizeRecognition({ food: [{ name: 'x', kcal: -5, protein: 'abc', fat: true, carbs: {} }] });
  assert.deepEqual(food, [{ name: 'x', amount: null, kcal: null, protein: null, fat: null, carbs: null }]);
});

test('округление: ккал до целого, БЖУ до одной десятой', () => {
  const { food } = normalizeRecognition({ food: [{ name: 'x', kcal: 99.6, protein: 1.26, fat: 0.04, carbs: 2 }] });
  assert.deepEqual(food, [{ name: 'x', amount: null, kcal: 100, protein: 1.3, fat: 0, carbs: 2 }]);
});

test('amount числом превращается в строку', () => {
  const { food } = normalizeRecognition({ food: [{ name: 'x', amount: 200 }] });
  assert.equal(food[0].amount, '200');
});

test('один продукт объектом вместо массива', () => {
  const { food } = normalizeRecognition({ food: { name: 'банан', kcal: 90 } });
  assert.equal(food.length, 1);
  assert.equal(food[0].name, 'банан');
});

test('{} и {"food": null} — это «еды нет», а не ошибка', () => {
  assert.deepEqual(normalizeRecognition({}), { food: [], source: 'text', barcode: null });
  assert.deepEqual(normalizeRecognition({ food: null }), { food: [], source: 'text', barcode: null });
});

test('source: для текста всегда «text», для фото — «label» или «estimate»', () => {
  assert.equal(normalizeRecognition({ food: [], source: 'label' }).source, 'text');
  assert.equal(normalizeRecognition({ food: [], source: 'label' }, true).source, 'label');
  assert.equal(normalizeRecognition({ food: [], source: 'estimate' }, true).source, 'estimate');
  assert.equal(normalizeRecognition({ food: [] }, true).source, 'estimate');
  assert.equal(normalizeRecognition({ food: [], source: 'что-то' }, true).source, 'estimate');
});

test('barcode: только с фото и только с верной контрольной цифрой', () => {
  assert.equal(normalizeRecognition({ food: [], barcode: '4 810268 031793' }, true).barcode, '4810268031793');
  assert.equal(normalizeRecognition({ food: [], barcode: 4810268031793 }, true).barcode, '4810268031793');
  assert.equal(normalizeRecognition({ food: [], barcode: '4810268031794' }, true).barcode, null);
  assert.equal(normalizeRecognition({ food: [], barcode: '4810268031793' }).barcode, null); // без фото
  assert.equal(normalizeRecognition({ food: [] }, true).barcode, null);
});

test('элементы без названия и мусор пропускаются', () => {
  const { food } = normalizeRecognition({ food: [{ kcal: 100 }, null, 'мусор', { name: '   ' }, { name: 'ок' }] });
  assert.deepEqual(food.map((f) => f.name), ['ок']);
});

test('совсем не та форма — ошибка', () => {
  assert.throws(() => normalizeRecognition({ items: [] }), /неожиданной формы/);
  assert.throws(() => normalizeRecognition({ food: 'банан' }), /неожиданной формы/);
  assert.throws(() => normalizeRecognition([]), /неожиданной формы/);
  assert.throws(() => normalizeRecognition(null), /неожиданной формы/);
});
