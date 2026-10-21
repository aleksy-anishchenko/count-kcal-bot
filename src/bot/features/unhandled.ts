import { Composer } from 'grammy';
import type { BotContext } from '../context.ts';

export const unhandledFeature = new Composer<BotContext>();

// Например, кнопка из старой версии бота. Без ответа на ней долго крутились бы «часики».
unhandledFeature.on('callback_query:data', async (ctx) => {
  await ctx.answerCallbackQuery({ text: 'Эта кнопка устарела.' });
});

unhandledFeature.on('message', (ctx) =>
  ctx.reply('Понимаю только текст и фото. Напиши, что съел, или пришли фото блюда.'));
