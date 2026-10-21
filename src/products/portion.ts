import type { Recognition } from '../recognition/types.ts';
import type { ProductWithNutrition } from './product.ts';

// Миллилитры считаем граммами: для напитков разница в пределах погрешности.
// Длинные единицы раньше коротких, иначе «гр» совпало бы как «г».
const GRAMS_RE = /(\d+(?:[.,]\d+)?)\s*(кг|kg|мл|ml|грамм(?:ов|а)?|гр|г|g|л|l)(?![a-zа-яё])/i;

export function parseGrams(text: string | null | undefined): number | null {
  const match = text?.match(GRAMS_RE);
  if (!match) return null;
  const value = parseFloat(match[1].replace(',', '.'));
  const unit = match[2].toLowerCase();
  const grams = ['кг', 'kg', 'л', 'l'].includes(unit) ? value * 1000 : value;
  return grams > 0 ? Math.round(grams) : null;
}

/** Порция: граммы из подписи, иначе вся упаковка, иначе 100 г — с пометкой в amount. */
export function recognitionFromProduct(product: ProductWithNutrition, caption: string | null | undefined): Recognition {
  const gramsFromCaption = parseGrams(caption);
  const gramsFromPackage = parseGrams(product.quantity);

  let grams: number;
  let amount: string;
  if (gramsFromCaption !== null) {
    grams = gramsFromCaption;
    amount = `${grams} г`;
  } else if (gramsFromPackage !== null) {
    grams = gramsFromPackage;
    amount = `вся упаковка, ${grams} г`;
  } else {
    grams = 100;
    amount = '100 г (порция не указана)';
  }

  const factor = grams / 100;
  const scale = (per100: number | null, digits: number): number | null =>
    (per100 === null ? null : Math.round(per100 * factor * 10 ** digits) / 10 ** digits);

  return {
    food: [{
      name: product.name,
      amount,
      kcal: scale(product.kcal100, 0),
      protein: scale(product.protein100, 1),
      fat: scale(product.fat100, 1),
      carbs: scale(product.carbs100, 1),
    }],
    source: product.nutritionEstimated ? 'name' : 'barcode',
    barcode: product.barcode,
  };
}
