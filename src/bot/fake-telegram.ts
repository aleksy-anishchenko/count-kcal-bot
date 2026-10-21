// Бот без Telegram, для create-bot.test.ts: ответы Bot API подменены, апдейты подаются руками.

import type { Bot, BotError } from 'grammy';
import type { Message, Update, UserFromGetMe } from 'grammy/types';
import type { BotContext } from './context.ts';

export type ApiCall = { method: string; payload: Record<string, unknown> };

type UpdateOptions = { userId?: number; chatType?: 'private' | 'group' };

const BOT_INFO: UserFromGetMe = {
  id: 999, is_bot: true, first_name: 'Подсчёт калорий', username: 'count_kcal_bot',
  can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false,
  can_connect_to_business: false, has_main_web_app: false, has_topics_enabled: false,
  allows_users_to_create_topics: false, can_manage_bots: false, supports_join_request_queries: false,
};

export function connectFakeTelegram(bot: Bot<BotContext>) {
  bot.botInfo = BOT_INFO; // вместо bot.init(), который спросил бы Telegram
  let calls: ApiCall[] = [];
  const failingMethods = new Map<string, string>();
  let lastMessageId = 100;
  let lastUpdateId = 0;
  const date = Math.floor(Date.now() / 1000);

  // prev не зовём — в сеть ничего не уходит.
  bot.api.config.use((_prev, method, payload) => {
    const params = payload as Record<string, unknown>;
    calls.push({ method, payload: params });
    const failure = failingMethods.get(method);
    if (failure) return Promise.resolve({ ok: false, error_code: 400, description: failure } as never);
    let result: unknown = true;
    if (method === 'getFile') {
      result = { file_id: params.file_id, file_unique_id: 'u', file_path: `files/${String(params.file_id)}` };
    } else if (method === 'sendMessage') {
      result = { message_id: ++lastMessageId, date, chat: { id: params.chat_id, type: 'private' }, text: params.text };
    }
    return Promise.resolve({ ok: true, result } as never);
  });

  /** Апдейты одновременно, как у runner; ошибку обработчика — в bot.errorHandler, тоже как у runner. */
  async function process(updates: Omit<Update, 'update_id'>[]): Promise<ApiCall[]> {
    calls = [];
    await Promise.all(updates.map((update) =>
      bot.handleUpdate({ update_id: ++lastUpdateId, ...update })
        .catch((err: BotError<BotContext>) => bot.errorHandler(err))));
    return calls;
  }

  function messageUpdate(fields: Partial<Message>, { userId = 1, chatType = 'private' }: UpdateOptions = {}) {
    const message = {
      message_id: ++lastMessageId, date,
      chat: chatType === 'private' ? { id: userId, type: 'private', first_name: 'Тест' } : { id: -userId, type: 'group', title: 'Группа' },
      from: { id: userId, is_bot: false, first_name: 'Тест' },
      ...fields,
    };
    return { message } as Omit<Update, 'update_id'>;
  }

  const photoFields = (fileId: string, caption?: string): Partial<Message> => ({
    photo: [{ file_id: `${fileId}-small`, file_unique_id: 's', width: 90, height: 90 }, { file_id: fileId, file_unique_id: 'b', width: 1280, height: 1280 }],
    ...(caption ? { caption } : {}),
  });

  return {
    failMethod: (method: string, description: string) => failingMethods.set(method, description),
    restoreMethods: () => failingMethods.clear(),

    sendText: (text: string, options?: UpdateOptions) => process([messageUpdate({
      text,
      ...(text.startsWith('/') ? { entities: [{ type: 'bot_command', offset: 0, length: text.split(' ')[0].length }] } : {}),
    }, options)]),

    /** По fileId подменённый fetch отдаёт байты картинки. */
    sendPhoto: (fileId: string, caption?: string) => process([messageUpdate(photoFields(fileId, caption))]),

    sendAlbum: (fileIds: string[], caption?: string) => process(fileIds.map((fileId, i) =>
      messageUpdate({ ...photoFields(fileId, i === 0 ? caption : undefined), media_group_id: 'album-1' }))),

    sendDocument: (fileId: string, mime: string, size = 1000) => process([messageUpdate({
      document: { file_id: fileId, file_unique_id: 'd', mime_type: mime, file_size: size, file_name: 'file' },
    })]),

    sendSticker: () => process([messageUpdate({
      sticker: { file_id: 's', file_unique_id: 's', type: 'regular', width: 1, height: 1, is_animated: false, is_video: false },
    })]),

    pressButton: (data: string, userId = 1) => process([{
      callback_query: {
        id: String(lastUpdateId), from: { id: userId, is_bot: false, first_name: 'Тест' }, chat_instance: 'c', data,
        message: { message_id: 5, date, chat: { id: userId, type: 'private', first_name: 'Тест' }, text: '…' },
      },
    }]),
  };
}

const ofMethod = (calls: ApiCall[], method: string) => calls.filter((call) => call.method === method);
const textOf = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Через разделитель — удобно проверять регуляркой. */
export const sentText = (calls: ApiCall[]): string =>
  ofMethod(calls, 'sendMessage').map((call) => textOf(call.payload.text)).join('\n---\n');

/** '' — ответ без текста. */
export const callbackAnswers = (calls: ApiCall[]): string[] =>
  ofMethod(calls, 'answerCallbackQuery').map((call) => textOf(call.payload.text));

export const editedTexts = (calls: ApiCall[]): string[] =>
  ofMethod(calls, 'editMessageText').map((call) => textOf(call.payload.text));

export const buttonData = (calls: ApiCall[]): string[] =>
  ofMethod(calls, 'sendMessage').flatMap((call) => {
    const markup = call.payload.reply_markup as { inline_keyboard?: { callback_data?: string }[][] } | undefined;
    return (markup?.inline_keyboard ?? []).flat().map((button) => button.callback_data ?? '');
  });

export const hasCall = (calls: ApiCall[], method: string): boolean => ofMethod(calls, method).length > 0;
