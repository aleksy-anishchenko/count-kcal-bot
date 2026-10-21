// Фото альбома приходят отдельными апдейтами с общим media_group_id. Первое ждёт остальные
// и идёт дальше с ctx.album, остальные дальше не идут. Стоит до sequentialize: иначе второе
// фото ждало бы в очереди, пока первое ждёт его самого.

import { setTimeout as sleep } from 'node:timers/promises';
import type { NextFunction } from 'grammy';
import type { Message } from 'grammy/types';
import type { BotContext } from './context.ts';

// Опоздавшее фото станет отдельной записью.
const ALBUM_WAIT_MS = 1000;

const collecting = new Map<string, Message[]>();

export async function albumMiddleware(ctx: BotContext, next: NextFunction): Promise<void> {
  const message = ctx.message;
  if (!message?.media_group_id) return next();

  const key = `${message.chat.id}:${message.media_group_id}`;
  const album = collecting.get(key);
  if (album) {
    album.push(message);
    return;
  }

  const messages = [message];
  collecting.set(key, messages);
  await sleep(ALBUM_WAIT_MS);
  collecting.delete(key);

  // Апдейты обрабатываются параллельно — порядок мог сбиться.
  ctx.album = messages.sort((a, b) => a.message_id - b.message_id);
  await next();
}
