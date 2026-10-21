import { InlineKeyboard, type Context } from 'grammy';
import { addEntry, findDuplicateEntry, getDaySummary } from '../db/entries.ts';
import type { Product } from '../products/product.ts';
import type { Recognition } from '../recognition/types.ts';
import { formatDay, formatDayLabel, formatFoodList, formatSourceNote, formatTime, formatTotals } from './format.ts';
import { getUserId, replyLong } from './telegram-helpers.ts';

const DUPLICATE_WINDOW_MS = 30 * 60_000;

export type EntryMeta = {
  /** Текст или «📷 подпись» — его показывает /undo. */
  entryText: string;
  /** По нему считается день записи. */
  sentAt: Date;
  kind: 'text' | 'photo';
  product?: Product | null;
};

/** Ждёт непустой recognition.food: на «ничего не нашёл» отвечают обработчики — советы у текста и фото разные. */
export async function saveAndReply(
  ctx: Context,
  recognition: Recognition,
  { entryText, sentAt, kind, product = null }: EntryMeta,
): Promise<void> {
  // Ответ на прошлое сообщение мог не дойти, и человек отправил текст снова. Записываем всё равно
  // (вдруг это второй кофе), но предупреждаем. Ищем до сохранения, иначе найдём саму эту запись.
  // Фото не проверяем: без подписи все они «📷 фото».
  const duplicate = kind === 'text'
    ? findDuplicateEntry(getUserId(ctx), entryText, new Date(sentAt.getTime() - DUPLICATE_WINDOW_MS))
    : null;

  const { id, day } = addEntry(getUserId(ctx), entryText, recognition.food, sentAt);

  const lines = [
    `✅ Записал (${formatDay(day)})`,
    '',
    formatFoodList(recognition.food),
    '',
    `Итого за ${formatDayLabel(day)}: ${formatTotals(getDaySummary(getUserId(ctx), day))}`,
  ];
  const sourceNote = formatSourceNote(recognition.source, product);
  if (sourceNote) lines.push('', sourceNote);
  if (duplicate) {
    lines.push('', `⚠️ Точно такое же сообщение уже записано в ${formatTime(new Date(duplicate.createdAt))}. ` +
      'Если это повтор — нажми «↩️ Отменить».');
  }

  // id в кнопке: она отменит именно эту запись, когда бы её ни нажали.
  await replyLong(ctx, lines.join('\n'), new InlineKeyboard().text('↩️ Отменить', `undo:${id}`));
}
