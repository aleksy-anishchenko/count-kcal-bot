import { Composer } from 'grammy';
import type { Message } from 'grammy/types';
import { hasNutrition, type Product } from '../../products/product.ts';
import { recognizePhoto } from '../../recognition/recognize-photo.ts';
import type { Image } from '../../recognition/types.ts';
import type { BotContext } from '../context.ts';
import { saveAndReply } from '../save-entry.ts';
import { downloadFile, replyLong } from '../telegram-helpers.ts';

// Telegram отдаёт боту до 20 МБ; гнать в нейросеть больше 10 МБ незачем.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

type ImageFile = { fileId: string; mime: Image['mime']; size: number | undefined };

/** У сжатого фото несколько размеров, последний — самый большой. Картинка «файлом» не сжата. */
function imageFileOf(message: Message): ImageFile | null {
  if (message.photo) {
    const largest = message.photo[message.photo.length - 1];
    return { fileId: largest.file_id, mime: 'image/jpeg', size: largest.file_size };
  }
  const mime = message.document?.mime_type;
  if (message.document && (mime === 'image/jpeg' || mime === 'image/png')) {
    return { fileId: message.document.file_id, mime, size: message.document.file_size };
  }
  return null;
}

function imageFilesOf(ctx: BotContext): ImageFile[] {
  const messages = ctx.album ?? (ctx.message ? [ctx.message] : []);
  return messages.map(imageFileOf).filter((file) => file !== null);
}

function productNotEstimatedText(product: Product): string {
  if (hasNutrition(product)) {
    // Калории есть — не вышло понять порцию из подписи («пару ложек»).
    return `Нашёл по штрихкоду: ${product.name}. Не понял, какую порцию посчитать — ` +
      'пришли фото ещё раз с подписью в граммах, например «150 г».';
  }
  const database = product.origin === 'rskrf' ? 'Роскачества' : 'Open Food Facts';
  // Условие Роскачества — ссылка на портал рядом с их данными.
  const link = product.origin === 'rskrf' ? `\n🏅 ${product.link ?? 'https://rskrf.ru'}` : '';
  // Без кавычек вокруг названия: в названиях товаров бывают свои «».
  return `Нашёл по штрихкоду в базе ${database}: ${product.name}. Калорий там нет, ` +
    'и оценить их по названию не получилось. Сними таблицу калорийности на упаковке ' +
    'или напиши текстом, что и сколько съел, — посчитаю.' + link;
}

export const photoEntryFeature = new Composer<BotContext>();

// Сообщение без картинок (стикер, PDF) идёт дальше, в unhandled.ts.
photoEntryFeature.on('message').filter((ctx) => imageFilesOf(ctx).length > 0, async (ctx) => {
  const files = imageFilesOf(ctx);
  if (files.some((file) => (file.size ?? 0) > MAX_IMAGE_BYTES)) {
    await ctx.reply('Картинка больше 10 МБ — не возьму. Пришли её обычным фото, не файлом, или уменьши.');
    return;
  }

  void ctx.replyWithChatAction('typing').catch(() => {});

  // В альбоме подпись обычно у одного фото, но бывает у нескольких.
  const messages = ctx.album ?? [ctx.msg];
  const caption = messages.map((message) => message.caption?.trim()).filter(Boolean).join('\n') || undefined;
  const images = await Promise.all(files.map(async (file) => ({ bytes: await downloadFile(ctx, file.fileId), mime: file.mime })));
  // AiError ловит bot/error-handler.ts.
  const result = await recognizePhoto({ images, caption });

  switch (result.status) {
    case 'recognized':
      await saveAndReply(ctx, result.recognition, {
        entryText: caption ? `📷 ${caption}` : images.length > 1 ? `📷 ${images.length} фото` : '📷 фото',
        sentAt: new Date(ctx.msg.date * 1000),
        kind: 'photo',
        product: result.product,
      });
      return;
    case 'product-not-estimated':
      // replyLong — без превью ссылки на Роскачество.
      await replyLong(ctx, productNotEstimatedText(result.product));
      return;
    case 'unknown-barcode':
      await ctx.reply(`Штрихкод ${result.barcode} прочитал, но в базах Open Food Facts и Роскачества такого товара нет. ` +
        'Сними таблицу калорийности на упаковке или напиши название продукта текстом — посчитаю.');
      return;
    case 'nothing-recognized':
      await ctx.reply('Не смог оценить еду на фото. Сними блюдо или таблицу калорийности крупнее, ' +
        'или напиши название продукта текстом.');
      return;
  }
});
