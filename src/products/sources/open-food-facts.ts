// Условие Open Food Facts: один запрос — одно реальное сканирование, поэтому повторные сканы — из кэша.

import { toTrimmedString } from '../../utils/text.ts';
import type { Product } from '../product.ts';
import { USER_AGENT } from './user-agent.ts';

const API_URL = 'https://world.openfoodfacts.org/api/v2/product/';
const PAGE_URL = 'https://world.openfoodfacts.org/product/';
const FIELDS = 'product_name_ru,product_name,brands,quantity,ingredients_text_ru,ingredients_text,nutriments';

// В базе числа бывают строками.
function toNutrientValue(value: unknown): number | null {
  const result = typeof value === 'number' ? value
    : typeof value === 'string' ? parseFloat(value.replace(',', '.')) : NaN;
  return Number.isFinite(result) && result >= 0 ? result : null;
}

/** null — товара нет или нет даже названия. Без калорий товар полезен: их оценит нейросеть. */
export function parseOpenFoodFactsProduct(barcode: string, data: unknown): Product | null {
  if (data === null || typeof data !== 'object') return null;
  const { status, product } = data as { status?: unknown; product?: Record<string, unknown> };
  if (status !== 1 || !product) return null;

  const baseName = toTrimmedString(product.product_name_ru) ?? toTrimmedString(product.product_name);
  if (!baseName) return null;
  // brands — «Teos, Савушкин»: первый бренд, если его нет в названии.
  const brand = toTrimmedString(product.brands)?.split(',')[0].trim();
  const name = brand && !baseName.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${baseName}` : baseName;

  const nutriments = (product.nutriments ?? {}) as Record<string, unknown>;
  const kcal100 = toNutrientValue(nutriments['energy-kcal_100g']);

  return {
    barcode,
    name,
    quantity: toTrimmedString(product.quantity),
    composition: toTrimmedString(product.ingredients_text_ru) ?? toTrimmedString(product.ingredients_text),
    kcal100,
    // БЖУ без калорий для пересчёта бесполезны.
    protein100: kcal100 === null ? null : toNutrientValue(nutriments.proteins_100g),
    fat100: kcal100 === null ? null : toNutrientValue(nutriments.fat_100g),
    carbs100: kcal100 === null ? null : toNutrientValue(nutriments.carbohydrates_100g),
    nutritionEstimated: false,
    origin: 'off',
    link: `${PAGE_URL}${barcode}`,
  };
}

/** null — товара нет; сетевые ошибки и прочие HTTP-статусы пробрасывает. */
export async function lookupOpenFoodFacts(barcode: string): Promise<Product | null> {
  const res = await fetch(`${API_URL}${barcode}.json?fields=${FIELDS}`, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open Food Facts HTTP ${res.status}`);
  return parseOpenFoodFactsProduct(barcode, await res.json());
}
