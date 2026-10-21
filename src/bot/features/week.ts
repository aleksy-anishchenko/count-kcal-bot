import { Composer } from 'grammy';
import { getDaySummaries } from '../../db/entries.ts';
import { dayKey, lastDays } from '../../utils/days.ts';
import { pluralize } from '../../utils/text.ts';
import type { BotContext } from '../context.ts';
import { formatDay, formatTotals } from '../format.ts';
import { getUserId } from '../telegram-helpers.ts';

export const weekFeature = new Composer<BotContext>();

weekFeature.command('week', async (ctx) => {
  const today = dayKey();
  const summaries = getDaySummaries(getUserId(ctx), lastDays(7, today));

  const lines = summaries.map((summary) =>
    `${formatDay(summary.day)}: ${summary.foodCount > 0 ? formatTotals(summary) : 'нет записей'}`,
  );

  // Незаконченный сегодняшний день занизил бы среднее.
  const finishedDays = summaries.filter((summary) => summary.day !== today && summary.foodCount > 0);
  let averageLine = 'Среднее: пока нет записей за прошлые дни';
  if (finishedDays.length > 0) {
    const averageKcal = Math.round(finishedDays.reduce((sum, summary) => sum + summary.kcal, 0) / finishedDays.length);
    const unknown = finishedDays.some((summary) => summary.unknownCount > 0) ? ' ⚠️ занижено: есть продукты без оценки' : '';
    const days = `${finishedDays.length} ${pluralize(finishedDays.length, ['дню', 'дням', 'дням'])}`;
    averageLine = `Среднее: ${averageKcal} ккал/день (по ${days} с записями, без сегодня)${unknown}`;
  }

  await ctx.reply([
    '📊 Последние 7 дней',
    '',
    ...lines,
    '',
    averageLine,
  ].join('\n'));
});
