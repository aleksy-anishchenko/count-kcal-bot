import { Composer } from 'grammy';
import { recognizeFood } from '../../recognition/recognize-food.ts';
import { pluralize } from '../../utils/text.ts';
import type { BotContext } from '../context.ts';
import { saveAndReply } from '../save-entry.ts';

// Обычная запись — пара строк. Длиннее — почти всегда вставленный по ошибке документ, а платим за каждый токен.
const MAX_TEXT_LENGTH = 1500;

export const textEntryFeature = new Composer<BotContext>();

textEntryFeature.on('message:text', async (ctx) => {
  const text = ctx.msg.text.trim();
  // Известные команды уже забрали features/ выше по цепочке.
  if (text.startsWith('/')) {
    await ctx.reply('Не знаю такую команду. /help — список команд.');
    return;
  }
  if (text.length > MAX_TEXT_LENGTH) {
    const symbols = pluralize(text.length, ['символ', 'символа', 'символов']);
    await ctx.reply(`Слишком длинное сообщение: ${text.length} ${symbols}, а я разбираю до ${MAX_TEXT_LENGTH}. ` +
      'Сократи или раздели на несколько сообщений.');
    return;
  }

  // «Печатает…» не ждём, а его ошибку глушим: это только индикатор.
  void ctx.replyWithChatAction('typing').catch(() => {});

  // День — по моменту отправки: пока бот был выключен, Telegram копил сообщения,
  // и вчерашний ужин не должен попасть в сегодня.
  const sentAt = new Date(ctx.msg.date * 1000);
  // AiError ловит bot/error-handler.ts.
  const recognition = await recognizeFood({ text });
  if (recognition.food.length === 0) {
    await ctx.reply('Не нашёл еды в сообщении. Напиши, например:\n«овсянка 100 г и 2 яйца»');
    return;
  }
  // Как у фото: запись из одних «?» только испортила бы итог дня. Частично оценённую сохраняем —
  // неоценённый продукт виден в ответе, а итог помечен как заниженный.
  if (recognition.food.every((item) => item.kcal === null)) {
    const names = recognition.food.map((item) => item.name).join(', ');
    await ctx.reply(`Не смог оценить калории: ${names}. Уточни, что это и сколько, ` +
      'например «печенье овсяное, 2 шт по 15 г», — посчитаю.');
    return;
  }
  await saveAndReply(ctx, recognition, { entryText: text, sentAt, kind: 'text' });
});
