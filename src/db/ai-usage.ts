// Расход токенов общий на бота, не по пользователям: платит один владелец ключа.

import { dayKey } from '../utils/days.ts';
import { db } from './connection.ts';

export type AiUsage = {
  day: string;
  requests: number;
  promptTokens: number;
  cachedPromptTokens: number;
  completionTokens: number;
};

const queries = {
  addUsage: db.prepare(`
    INSERT INTO ai_usage (day, requests, prompt_tokens, cached_prompt_tokens, completion_tokens)
    VALUES (?, 1, ?, ?, ?)
    ON CONFLICT (day) DO UPDATE SET
      requests             = requests + 1,
      prompt_tokens        = prompt_tokens + excluded.prompt_tokens,
      cached_prompt_tokens = cached_prompt_tokens + excluded.cached_prompt_tokens,
      completion_tokens    = completion_tokens + excluded.completion_tokens
  `),
  selectUsage: db.prepare(`
    SELECT day, requests, prompt_tokens AS promptTokens, cached_prompt_tokens AS cachedPromptTokens,
           completion_tokens AS completionTokens
    FROM ai_usage WHERE day BETWEEN ? AND ?
  `),
};

export function recordAiUsage(
  tokens: { promptTokens: number; cachedPromptTokens: number; completionTokens: number },
  at: Date = new Date(),
): void {
  queries.addUsage.run(dayKey(at), tokens.promptTokens, tokens.cachedPromptTokens, tokens.completionTokens);
}

/** Дни без запросов — с нулями. `days` по возрастанию и подряд, как у getDaySummaries. */
export function getAiUsage(days: string[]): AiUsage[] {
  const rows = queries.selectUsage.all(days[0], days[days.length - 1]) as AiUsage[];
  const usageByDay = new Map(rows.map((row) => [row.day, row]));
  return days.map((day) => ({
    day,
    requests: usageByDay.get(day)?.requests ?? 0,
    promptTokens: usageByDay.get(day)?.promptTokens ?? 0,
    cachedPromptTokens: usageByDay.get(day)?.cachedPromptTokens ?? 0,
    completionTokens: usageByDay.get(day)?.completionTokens ?? 0,
  }));
}
