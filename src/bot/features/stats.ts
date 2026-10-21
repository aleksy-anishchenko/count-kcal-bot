// Токены, а не рубли: цены DeepSeek меняются и не читаются скриптом.

import { Composer } from 'grammy';
import { getAiUsage, type AiUsage } from '../../db/ai-usage.ts';
import { dayKey, lastDays } from '../../utils/days.ts';
import { pluralize } from '../../utils/text.ts';
import type { BotContext } from '../context.ts';

const formatCount = (count: number): string => count.toLocaleString('ru-RU');

function formatUsage(label: string, usage: Omit<AiUsage, 'day'>): string {
  if (usage.requests === 0) return `${label}: запросов не было`;
  const requests = pluralize(usage.requests, ['запрос', 'запроса', 'запросов']);
  const tokens = pluralize(usage.promptTokens, ['токен', 'токена', 'токенов']);
  return `${label}: ${formatCount(usage.requests)} ${requests}, на входе ${formatCount(usage.promptTokens)} ${tokens} ` +
    `(из кэша ${formatCount(usage.cachedPromptTokens)}), на выходе ${formatCount(usage.completionTokens)}`;
}

export const statsFeature = new Composer<BotContext>();

statsFeature.command('stats', async (ctx) => {
  const today = dayKey();
  const week = getAiUsage(lastDays(7, today));
  const weekTotal = week.reduce((total, day) => ({
    requests: total.requests + day.requests,
    promptTokens: total.promptTokens + day.promptTokens,
    cachedPromptTokens: total.cachedPromptTokens + day.cachedPromptTokens,
    completionTokens: total.completionTokens + day.completionTokens,
  }), { requests: 0, promptTokens: 0, cachedPromptTokens: 0, completionTokens: 0 });

  await ctx.reply([
    '🧮 Расход DeepSeek (на весь бот)',
    '',
    formatUsage('Сегодня', week[week.length - 1]),
    formatUsage('За 7 дней', weekTotal),
    '',
    'Токены из кэша DeepSeek дешевле остальных входных. Цены — platform.deepseek.com, раздел Models & Pricing.',
  ].join('\n'), { link_preview_options: { is_disabled: true } });
});
