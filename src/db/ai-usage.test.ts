import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { getAiUsage, recordAiUsage } from './ai-usage.ts';
import { closeDb } from './connection.ts';

after(() => closeDb());

test('recordAiUsage складывает запросы за день; дни без запросов — с нулями', () => {
  // TZ=Europe/Moscow: 22:30 UTC 20-го — уже 21-е по Москве.
  recordAiUsage({ promptTokens: 1000, cachedPromptTokens: 600, completionTokens: 50 }, new Date('2026-10-21T09:00:00Z'));
  recordAiUsage({ promptTokens: 500, cachedPromptTokens: 0, completionTokens: 30 }, new Date('2026-10-20T22:30:00Z'));

  assert.deepEqual(getAiUsage(['2026-10-20', '2026-10-21']).map((row) => ({ ...row })), [
    { day: '2026-10-20', requests: 0, promptTokens: 0, cachedPromptTokens: 0, completionTokens: 0 },
    { day: '2026-10-21', requests: 2, promptTokens: 1500, cachedPromptTokens: 600, completionTokens: 80 },
  ]);
});
