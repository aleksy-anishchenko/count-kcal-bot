import type { Context } from 'grammy';
import type { Message } from 'grammy/types';

export type AlbumFlavor = {
  /** Все сообщения альбома по порядку — у первого сообщения альбома (см. album.ts). */
  album?: Message[];
};

export type BotContext = Context & AlbumFlavor;
