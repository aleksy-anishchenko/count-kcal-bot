// В .env.test задано TZ=Europe/Moscow (UTC+3), на это рассчитаны ожидания ниже.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, lastDays } from './days.ts';

test('dayKey: 23:30 UTC — по Москве уже следующий день', () => {
  assert.equal(dayKey(new Date('2026-10-20T23:30:00Z')), '2026-10-21');
});

test('dayKey: 20:30 UTC — по Москве ещё тот же день', () => {
  assert.equal(dayKey(new Date('2026-10-20T20:30:00Z')), '2026-10-20');
});

test('lastDays через границу месяца и года, от старых к новым', () => {
  assert.deepEqual(lastDays(3, '2026-01-01'), ['2025-12-30', '2025-12-31', '2026-01-01']);
});

test('lastDays(1) — только сегодня', () => {
  assert.deepEqual(lastDays(1, '2026-10-20'), ['2026-10-20']);
});
