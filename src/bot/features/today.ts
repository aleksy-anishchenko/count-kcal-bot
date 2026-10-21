import { Composer } from 'grammy';
import { getDayFood, getDaySummary } from '../../db/entries.ts';
import { dayKey } from '../../utils/days.ts';
import type { BotContext } from '../context.ts';
import { formatDay, formatFoodList, formatTotals } from '../format.ts';
import { getUserId, replyLong } from '../telegram-helpers.ts';

export const todayFeature = new Composer<BotContext>();

todayFeature.command('today', async (ctx) => {
  const day = dayKey();
  const food = getDayFood(getUserId(ctx), day);

  if (food.length === 0) {
    await ctx.reply(`📅 ${formatDay(day)}: записей пока нет. Напиши, что съел.`);
    return;
  }

  await replyLong(ctx, [
    `📅 ${formatDay(day)}`,
    '',
    formatFoodList(food),
    '',
    `Итого: ${formatTotals(getDaySummary(getUserId(ctx), day))}`,
  ].join('\n'));
});
