import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productWithoutNutrition, yogurt } from '../products/test-fixtures.ts';
import { formatDay, formatFoodList, formatNumber, formatRemovedEntry, formatSourceNote, formatTotals } from './format.ts';

test('formatDay: день недели и дата', () => {
  assert.equal(formatDay('2026-10-19'), 'пн, 19.10');
});

test('formatNumber: округляет, null и undefined показывает как «?»', () => {
  assert.equal(formatNumber(12.4), '12');
  assert.equal(formatNumber(12.6), '13');
  assert.equal(formatNumber(null), '?');
  assert.equal(formatNumber(undefined), '?');
});

test('formatTotals без продуктов без оценки', () => {
  const summary = { day: '2026-10-20', kcal: 1234.4, protein: 50.4, fat: 30, carbs: 100, foodCount: 3, unknownCount: 0 };
  assert.equal(formatTotals(summary), '1234 ккал · Б 50 / Ж 30 / У 100');
});

test('formatTotals помечает продукты без оценки', () => {
  const summary = { day: '2026-10-20', kcal: 500, protein: 10, fat: 10, carbs: 10, foodCount: 3, unknownCount: 2 };
  assert.equal(formatTotals(summary), '500 ккал · Б 10 / Ж 10 / У 10 (⚠️ без оценки: 2)');
});

test('formatFoodList: с количеством и без, null-поля как «?»', () => {
  const lines = formatFoodList([
    { name: 'банан', amount: '1 шт', kcal: 90, protein: 1, fat: 0, carbs: 23 },
    { name: 'тунец', amount: null, kcal: null, protein: 20, fat: null, carbs: 0 },
  ]);
  assert.equal(lines, [
    '• банан — 1 шт — 90 ккал (Б1 / Ж0 / У23)',
    '• тунец — ? ккал (Б20 / Ж? / У0)',
  ].join('\n'));
});

test('formatSourceNote без товара: пометка только для фото', () => {
  assert.equal(formatSourceNote('text', null), null);
  assert.match(formatSourceNote('label', null) ?? '', /этикетке/);
  assert.match(formatSourceNote('estimate', null) ?? '', /приблизительная/);
});

test('formatSourceNote с товаром: Роскачество всегда со ссылкой, Open Food Facts без', () => {
  assert.match(formatSourceNote('name', productWithoutNutrition) ?? '',
    /Роскачества.*оценены по названию.*https:\/\/rskrf\.ru\/goods\/x\//);
  assert.match(formatSourceNote('barcode', { ...productWithoutNutrition, kcal100: 50 }) ?? '',
    /данным Роскачества\. https:\/\/rskrf\.ru\/goods\/x\//);
  assert.equal(formatSourceNote('barcode', yogurt), '📦 Числа с упаковки по базе Open Food Facts.');
  assert.match(formatSourceNote('name', { ...yogurt, kcal100: null }) ?? '', /оценены по названию/);
});

test('formatRemovedEntry: текст без кавычек; опустевший день — «записей больше нет»', () => {
  const removed = { id: 1, day: '2026-10-19', createdAt: '2026-10-19T09:05:00Z', text: 'йогурт «Чудо»' };
  const empty = { day: '2026-10-19', kcal: 0, protein: 0, fat: 0, carbs: 0, foodCount: 0, unknownCount: 0 };
  assert.equal(formatRemovedEntry(removed, empty), '↩️ Удалил запись от пн, 19.10 12:05:\nйогурт «Чудо»\n\nЗа пн, 19.10 записей больше нет.');
  assert.match(formatRemovedEntry(removed, { ...empty, kcal: 300, foodCount: 2 }), /Итого за пн, 19\.10: 300 ккал/);
});
