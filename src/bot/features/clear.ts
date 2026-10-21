import { Composer, InlineKeyboard } from 'grammy';
import { deleteDayEntries, getDaySummary, getLastEntryIdOfDay } from '../../db/entries.ts';
import { dayKey } from '../../utils/days.ts';
import { pluralize } from '../../utils/text.ts';
import type { BotContext } from '../context.ts';
import { formatDay, formatNumber } from '../format.ts';
import { editText, getUserId } from '../telegram-helpers.ts';

export const clearFeature = new Composer<BotContext>();

clearFeature.command('clear', async (ctx) => {
  const day = dayKey();
  const summary = getDaySummary(getUserId(ctx), day);
  const lastId = getLastEntryIdOfDay(getUserId(ctx), day);
  if (summary.foodCount === 0 || lastId === null) {
    await ctx.reply(`📅 ${formatDay(day)}: записей нет — удалять нечего.`);
    return;
  }

  // Дата и id последней записи в кнопке: нажатая позже, она удалит только то, о чём спрашивали, —
  // не новый день после полуночи и не записи, добавленные после вопроса.
  const keyboard = new InlineKeyboard()
    .text('🗑 Да, удалить', `clear:${day}:${lastId}`)
    .text('Отмена', 'clear:cancel');

  await ctx.reply(
    `Удалить все записи за ${formatDay(day)}?\n` +
    `Это ${summary.foodCount} ${pluralize(summary.foodCount, ['продукт', 'продукта', 'продуктов'])} ` +
      `на ${formatNumber(summary.kcal)} ккал. Вернуть их не получится.`,
    { reply_markup: keyboard },
  );
});

clearFeature.callbackQuery(/^clear:(\d{4}-\d{2}-\d{2}):(\d+)$/, async (ctx) => {
  const day = ctx.match[1];
  const removedCount = deleteDayEntries(getUserId(ctx), day, Number(ctx.match[2]));
  const leftCount = getDaySummary(getUserId(ctx), day).foodCount;
  // Без ответа на кнопке долго крутились бы «часики».
  await ctx.answerCallbackQuery();
  await editText(ctx, removedCount === 0
    ? `За ${formatDay(day)} удалять уже нечего.`
    : `🗑 Удалил записи за ${formatDay(day)}.` +
      (leftCount > 0 ? '\nЗаписи, добавленные после вопроса, оставил.' : ''));
});

clearFeature.callbackQuery('clear:cancel', async (ctx) => {
  await ctx.answerCallbackQuery();
  await editText(ctx, 'Ок, ничего не удалял.');
});
