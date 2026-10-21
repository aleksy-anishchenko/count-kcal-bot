// База в памяти: у каждого файла тестов свой процесс и своя пустая база. Тесты делят её, поэтому разные userId.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import type { FoodItem } from '../recognition/types.ts';
import { closeDb } from './connection.ts';
import {
  addEntry, deleteDayEntries, deleteEntryById, deleteLastEntry, findDuplicateEntry, getDayFood,
  getDaySummaries, getDaySummary, getLastEntryIdOfDay,
} from './entries.ts';

after(() => closeDb());

const item = (name: string, kcal: number | null, extra: Partial<FoodItem> = {}): FoodItem =>
  ({ name, amount: null, kcal, protein: 1, fat: 1, carbs: 1, ...extra });

test('addEntry + getDayFood + getDaySummary', () => {
  const userId = 1;
  const { day } = addEntry(userId, 'овсянка и банан', [item('овсянка', 260), item('банан', 90)], new Date('2026-10-20T08:00:00Z'));
  assert.equal(day, '2026-10-20');

  const food = getDayFood(userId, day);
  assert.deepEqual(food.map((f) => f.name), ['овсянка', 'банан']);

  const summary = getDaySummary(userId, day);
  assert.equal(summary.kcal, 350);
  assert.equal(summary.foodCount, 2);
  assert.equal(summary.unknownCount, 0);
});

test('unknownCount: продукт с null хотя бы в одном поле', () => {
  const userId = 2;
  const { day } = addEntry(userId, 'x', [item('а', 100), item('б', null), item('в', 50, { fat: null })], new Date('2026-10-20T08:00:00Z'));
  const summary = getDaySummary(userId, day);
  assert.equal(summary.kcal, 150);
  assert.equal(summary.foodCount, 3);
  assert.equal(summary.unknownCount, 2);
});

test('getDaySummaries: дни без записей возвращаются с нулями', () => {
  const userId = 3;
  addEntry(userId, 'x', [item('а', 100)], new Date('2026-10-19T08:00:00Z'));
  const summaries = getDaySummaries(userId, ['2026-10-18', '2026-10-19', '2026-10-20']);
  assert.deepEqual(summaries.map((s) => [s.day, s.foodCount, s.kcal]), [
    ['2026-10-18', 0, 0],
    ['2026-10-19', 1, 100],
    ['2026-10-20', 0, 0],
  ]);
});

test('deleteLastEntry удаляет последнюю запись и её продукты каскадом', () => {
  const userId = 4;
  const sentAt = new Date('2026-10-20T08:00:00Z');
  addEntry(userId, 'первая', [item('а', 100)], sentAt);
  addEntry(userId, 'вторая', [item('б', 200)], sentAt);

  const removed = deleteLastEntry(userId);
  assert.equal(removed?.text, 'вторая');
  assert.equal(removed?.createdAt, '2026-10-20T08:00:00.000Z');
  assert.deepEqual(getDayFood(userId, '2026-10-20').map((f) => f.name), ['а']);

  assert.equal(deleteLastEntry(userId)?.text, 'первая');
  assert.equal(deleteLastEntry(userId), null);
});

test('deleteEntryById: чужой userId не удаляет, повторное удаление даёт null', () => {
  const userId = 5;
  const { id } = addEntry(userId, 'x', [item('а', 100)], new Date('2026-10-20T08:00:00Z'));
  assert.equal(deleteEntryById(999, id), null);
  assert.equal(deleteEntryById(userId, id)?.id, id);
  assert.equal(deleteEntryById(userId, id), null);
});

test('deleteDayEntries не трогает записи, добавленные после вопроса', () => {
  const userId = 6;
  const sentAt = new Date('2026-10-20T08:00:00Z');
  addEntry(userId, 'а', [item('а', 100)], sentAt);
  const { day } = addEntry(userId, 'б', [item('б', 100)], sentAt);
  const upToId = getLastEntryIdOfDay(userId, day);
  assert.ok(upToId !== null);
  addEntry(userId, 'в', [item('в', 100)], sentAt);

  assert.equal(deleteDayEntries(userId, day, upToId), 2);
  assert.deepEqual(getDayFood(userId, day).map((f) => f.name), ['в']);
});

test('getLastEntryIdOfDay без записей — null', () => {
  assert.equal(getLastEntryIdOfDay(7, '2026-10-20'), null);
});

test('findDuplicateEntry: тот же текст в окне, вне окна и другой текст', () => {
  const userId = 8;
  addEntry(userId, 'кофе', [item('кофе', 5)], new Date('2026-10-20T10:00:00Z'));
  assert.equal(findDuplicateEntry(userId, 'кофе', new Date('2026-10-20T09:50:00Z'))?.createdAt, '2026-10-20T10:00:00.000Z');
  assert.equal(findDuplicateEntry(userId, 'кофе', new Date('2026-10-20T10:01:00Z')), null);
  assert.equal(findDuplicateEntry(userId, 'чай', new Date('2026-10-20T09:50:00Z')), null);
});
