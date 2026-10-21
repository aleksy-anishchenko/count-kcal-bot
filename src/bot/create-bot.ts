// Порядок bot.use() важен: апдейт идёт по цепочке, и первый подходящий обработчик его забирает.

import { Bot } from 'grammy';
import { sequentialize } from '@grammyjs/runner';
import { accessMiddleware } from './access.ts';
import { albumMiddleware } from './album.ts';
import type { BotContext } from './context.ts';
import { handleBotError } from './error-handler.ts';
import { clearFeature } from './features/clear.ts';
import { helpFeature } from './features/help.ts';
import { photoEntryFeature } from './features/photo-entry.ts';
import { statsFeature } from './features/stats.ts';
import { textEntryFeature } from './features/text-entry.ts';
import { todayFeature } from './features/today.ts';
import { undoFeature } from './features/undo.ts';
import { unhandledFeature } from './features/unhandled.ts';
import { weekFeature } from './features/week.ts';

export function createBot(token: string): Bot<BotContext> {
  const bot = new Bot<BotContext>(token);

  // До sequentialize, иначе фото альбома ждали бы друг друга в очереди.
  bot.use(albumMiddleware);

  // Runner обрабатывает апдейты параллельно, но сообщения одного человека — строго по очереди:
  // иначе «банан» и сразу /undo обогнали бы друг друга.
  bot.use(sequentialize((ctx) => ctx.from?.id.toString()));
  bot.use(accessMiddleware);

  // Команды раньше текста, иначе /today ушёл бы в нейросеть как еда.
  bot.use(helpFeature, todayFeature, weekFeature, statsFeature, undoFeature, clearFeature);
  bot.use(textEntryFeature, photoEntryFeature);
  bot.use(unhandledFeature); // последним

  bot.catch(handleBotError);
  return bot;
}
