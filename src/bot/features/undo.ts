import { Composer } from 'grammy';
import { deleteEntryById, deleteLastEntry, getDaySummary } from '../../db/entries.ts';
import type { BotContext } from '../context.ts';
import { formatRemovedEntry } from '../format.ts';
import { getUserId, removeKeyboard } from '../telegram-helpers.ts';

export const undoFeature = new Composer<BotContext>();

undoFeature.command('undo', async (ctx) => {
  const removed = deleteLastEntry(getUserId(ctx));
  if (!removed) {
    await ctx.reply('Удалять нечего — записей ещё нет.');
    return;
  }
  await ctx.reply(formatRemovedEntry(removed, getDaySummary(getUserId(ctx), removed.day)));
});

// В отличие от /undo, кнопка удаляет именно свою запись: повторное нажатие ничего лишнего не сотрёт.
undoFeature.callbackQuery(/^undo:(\d+)$/, async (ctx) => {
  const removed = deleteEntryById(getUserId(ctx), Number(ctx.match[1]));
  if (!removed) {
    await ctx.answerCallbackQuery({ text: 'Эта запись уже удалена.' });
    return;
  }
  await ctx.answerCallbackQuery();
  // Сначала отчёт: если сообщение с кнопкой уже удалено, убрать кнопку не выйдет,
  // а узнать об удалении нужно.
  await ctx.reply(formatRemovedEntry(removed, getDaySummary(getUserId(ctx), removed.day)));
  await removeKeyboard(ctx);
});
