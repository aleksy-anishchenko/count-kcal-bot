import { GrammyError, type Context, type InlineKeyboard } from 'grammy';
import { config } from '../config.ts';

export const MESSAGE_MAX_LENGTH = 4096;

/** `!` безопасен: access.ts пропускает дальше только апдейты с автором. */
export const getUserId = (ctx: Context): number => ctx.from!.id;

export function splitMessage(text: string): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const line of text.split('\n')) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length <= MESSAGE_MAX_LENGTH) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    current = line;
    while (current.length > MESSAGE_MAX_LENGTH) {
      // Не разрезаем суррогатную пару (эмодзи): Telegram отклонил бы битый символ.
      const code = current.charCodeAt(MESSAGE_MAX_LENGTH - 1);
      const cut = code >= 0xd800 && code <= 0xdbff ? MESSAGE_MAX_LENGTH - 1 : MESSAGE_MAX_LENGTH;
      chunks.push(current.slice(0, cut));
      current = current.slice(cut);
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Длинный текст — несколькими сообщениями. Без превью ссылок: карточка товара заняла бы пол-экрана. */
export async function replyLong(ctx: Context, text: string, keyboard?: InlineKeyboard): Promise<void> {
  const chunks = splitMessage(text);
  for (const [i, chunk] of chunks.entries()) {
    const isLast = i === chunks.length - 1;
    await ctx.reply(chunk, {
      link_preview_options: { is_disabled: true },
      ...(isLast && keyboard ? { reply_markup: keyboard } : {}),
    });
  }
}

/** Повторное нажатие той же кнопки даёт 400 «message is not modified» — это не ошибка. */
export async function editText(ctx: Context, text: string): Promise<void> {
  try {
    await ctx.editMessageText(text);
  } catch (err) {
    if (!(err instanceof GrammyError && err.description.includes('message is not modified'))) throw err;
  }
}

/** Кнопки убираем для красоты: отказ Telegram глотаем, сетевые ошибки пробрасываем. */
export async function removeKeyboard(ctx: Context): Promise<void> {
  try {
    await ctx.editMessageReplyMarkup();
  } catch (err) {
    if (!(err instanceof GrammyError)) throw err;
  }
}

/** В URL файла есть токен; если URL попадёт в ошибку, hide-token-in-logs.ts его скроет. */
export async function downloadFile(ctx: Context, fileId: string): Promise<Uint8Array> {
  const file = await ctx.api.getFile(fileId);
  if (!file.file_path) throw new Error('Telegram не вернул file_path');
  const res = await fetch(`https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Telegram: не удалось скачать файл, HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}
