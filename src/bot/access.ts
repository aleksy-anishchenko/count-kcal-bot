import type { Context, NextFunction } from 'grammy';
import { config } from '../config.ts';

export async function accessMiddleware(ctx: Context, next: NextFunction): Promise<void> {
  if (!ctx.from) return;
  // В группе чужой участник мог бы нажать кнопку /clear, а сообщения группы уходили бы в DeepSeek.
  if (ctx.chat?.type !== 'private') return;
  if (config.allowedUserIds.length > 0 && !config.allowedUserIds.includes(ctx.from.id)) {
    // На служебные апдейты (например, «пользователь заблокировал бота») ответ упал бы с 403.
    if (ctx.message) {
      await ctx.reply(`⛔ Доступ закрыт. Твой id: ${ctx.from.id} — добавь его в ALLOWED_USER_IDS.`);
    } else if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery({ text: '⛔ Доступ закрыт' });
    }
    return;
  }
  await next();
}
