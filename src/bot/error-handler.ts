import type { BotError, Context } from 'grammy';
import { AiError, TruncatedResponseError } from '../recognition/recognize-food.ts';

function errorMessage(error: unknown): string {
  if (error instanceof TruncatedResponseError) {
    return '😕 Слишком длинный список — не успел разобрать целиком. Раздели его на несколько сообщений.';
  }
  if (error instanceof AiError) {
    return '😕 Не удалось разобрать запись (ошибка нейросети). Попробуй ещё раз чуть позже.';
  }
  return '😕 Что-то пошло не так. Попробуй ещё раз.';
}

export async function handleBotError({ ctx, error }: BotError<Context>): Promise<void> {
  console.error(error instanceof AiError ? 'Ошибка нейросети:' : 'Ошибка в обработчике:', error);
  try {
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery({ text: '😕 Что-то пошло не так' });
    } else if (ctx.message) {
      await ctx.reply(errorMessage(error));
    }
  } catch {
    // Ответ тоже не ушёл — ошибка уже в логе.
  }
}
