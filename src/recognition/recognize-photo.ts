// Порядок шагов для фото, дешёвые и точные первыми: декодер штрихкода → базы товаров → нейросеть.
// Фото альбома — одна запись.

import { readBarcode } from '../products/barcode.ts';
import { findProduct } from '../products/find-product.ts';
import { parseGrams, recognitionFromProduct } from '../products/portion.ts';
import { hasNutrition, type Product, type ProductWithNutrition } from '../products/product.ts';
import { buildPortionPrompt } from '../products/product-prompt.ts';
import { estimateNutrition } from './estimate-nutrition.ts';
import { recognizeFood, type RecognitionInput } from './recognize-food.ts';
import type { Image, Recognition } from './types.ts';

export type PhotoInput = {
  images: Image[];
  caption: string | undefined;
};

/** Записывается только 'recognized' — в нём есть хотя бы одна калория. */
export type PhotoRecognition =
  | { status: 'recognized'; recognition: Recognition; product: Product | null }
  | { status: 'product-not-estimated'; product: Product }
  | { status: 'unknown-barcode'; barcode: string }
  | { status: 'nothing-recognized' };

/** Внешние шаги приходят параметром, чтобы в тестах подставить заглушки. */
export type PhotoSteps = {
  readBarcode: (bytes: Uint8Array) => Promise<string | null>;
  findProduct: (barcode: string) => Promise<Product | null>;
  recognizeFood: (input: RecognitionInput) => Promise<Recognition>;
  estimateNutrition: (product: Product) => Promise<ProductWithNutrition | null>;
};

const realSteps: PhotoSteps = { readBarcode, findProduct, recognizeFood, estimateNutrition };

/** AiError пробрасывает: на неё отвечает bot/error-handler.ts. */
export async function recognizePhoto({ images, caption }: PhotoInput, steps: PhotoSteps = realSteps): Promise<PhotoRecognition> {
  // В альбоме берём первый товар, который нашёлся.
  const decodedBarcodes: string[] = [];
  let product: Product | null = null;
  for (const image of images) {
    const code = await steps.readBarcode(image.bytes);
    if (!code || decodedBarcodes.includes(code)) continue;
    decodedBarcodes.push(code);
    product = await steps.findProduct(code);
    if (product) break;
  }

  let recognition: Recognition;
  if (product) {
    ({ recognition, product } = await recognizeProduct(product, caption, steps));
  } else {
    recognition = await steps.recognizeFood({ text: caption, images });

    // Декодер мог не разобрать полоски, а модель — прочитать цифры под ними. Коды декодера
    // второй раз не ищем: их в базах уже не нашли.
    if (recognition.barcode && !decodedBarcodes.includes(recognition.barcode)) {
      const productByModelBarcode = await steps.findProduct(recognition.barcode);
      if (productByModelBarcode) {
        ({ recognition, product } = await recognizeProduct(productByModelBarcode, caption, steps));
      }
    }
  }

  const barcode = decodedBarcodes[0] ?? recognition.barcode;
  const caloriesCount = recognition.food.filter((item) => item.kcal !== null).length;
  const productInfo = product
    ? `${product.origin}: ${product.name}, ккал в базе: ${product.nutritionEstimated ? 'оценка' : hasNutrition(product) ? 'да' : 'нет'}`
    : 'нет';
  console.log(`Фото (${images.length}): штрихкод ${barcode ?? 'нет'}, товар в базе ${productInfo}, ` +
    `подпись: ${caption ? 'есть' : 'нет'}, источник: ${recognition.source}, продуктов с ккал: ${caloriesCount}`);

  // Запись «? ккал» только испортила бы итог дня — вместо неё бот объяснит, что делать.
  if (caloriesCount === 0) {
    if (product) return { status: 'product-not-estimated', product };
    if (barcode) return { status: 'unknown-barcode', barcode };
    return { status: 'nothing-recognized' };
  }
  return { status: 'recognized', recognition, product };
}

/**
 * Нет чисел в базе — сначала оценка на 100 г. Порция ясна (граммы в подписи или вся упаковка) —
 * арифметика, подпись без граммов («съел половину») — нейросеть. Товар возвращается уже с калориями.
 */
async function recognizeProduct(
  product: Product,
  caption: string | undefined,
  steps: PhotoSteps,
): Promise<{ recognition: Recognition; product: Product }> {
  const withNutrition = hasNutrition(product) ? product : await steps.estimateNutrition(product);
  if (!withNutrition) {
    return { recognition: { food: [], source: 'name', barcode: product.barcode }, product };
  }

  if (!caption || parseGrams(caption) !== null) {
    return { recognition: recognitionFromProduct(withNutrition, caption), product: withNutrition };
  }
  const recognition = await steps.recognizeFood({ text: buildPortionPrompt(withNutrition, caption) });
  return {
    recognition: { ...recognition, source: withNutrition.nutritionEstimated ? 'name' : 'barcode', barcode: product.barcode },
    product: withNutrition,
  };
}
