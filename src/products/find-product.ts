import { cacheProduct, getCachedProduct } from '../db/product-cache.ts';
import { hasNutrition, type Product } from './product.ts';
import { lookupOpenFoodFacts } from './sources/open-food-facts.ts';
import { lookupRoskachestvo } from './sources/roskachestvo.ts';

type ProductDatabase = { name: string; lookup: (barcode: string) => Promise<Product | null> };

// Порядок — приоритет: у Open Food Facts числа полями, у Роскачества — текстом.
const PRODUCT_DATABASES: ProductDatabase[] = [
  { name: 'Open Food Facts', lookup: lookupOpenFoodFacts },
  { name: 'Роскачество', lookup: lookupRoskachestvo },
];

// Состав и КБЖУ меняются, в базах исправляют ошибки.
const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** `now` передают только тесты. */
export async function findProduct(barcode: string, now: Date = new Date()): Promise<Product | null> {
  const cached = getCachedProduct(barcode);
  if (cached && now.getTime() - cached.fetchedAt.getTime() < CACHE_TTL_MS) return cached.product;

  const fresh = await lookupDatabases(barcode);
  if (fresh) {
    cacheProduct(fresh, now);
    return fresh;
  }
  // Базы не ответили — устаревшие данные лучше, чем никаких. Срок не продлеваем.
  return cached?.product ?? null;
}

// Товар с калориями важнее «только названия», поэтому на названии не останавливаемся.
async function lookupDatabases(barcode: string): Promise<Product | null> {
  let productWithoutNutrition: Product | null = null;
  for (const database of PRODUCT_DATABASES) {
    let product: Product | null;
    try {
      product = await database.lookup(barcode);
    } catch (err) {
      console.warn(`${database.name} недоступен:`, err);
      continue;
    }
    if (!product) continue;
    if (hasNutrition(product)) return product;
    productWithoutNutrition ??= product;
  }
  return productWithoutNutrition;
}
