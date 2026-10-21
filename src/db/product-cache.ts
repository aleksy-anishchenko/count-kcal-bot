import type { Product, ProductWithNutrition } from '../products/product.ts';
import { db } from './connection.ts';

/** `fetchedAt` — когда товар скачан из базы: по нему find-product.ts решает, не устарел ли он. */
export type CachedProduct = { product: Product; fetchedAt: Date };

// В SQLite нет boolean: флаг хранится как 0/1.
type ProductRow = Omit<Product, 'nutritionEstimated'> & { nutritionEstimated: number; fetchedAt: string };

const queries = {
  selectProduct: db.prepare(`
    SELECT barcode, name, quantity, composition, kcal100, protein100, fat100, carbs100,
           nutrition_estimated AS nutritionEstimated, origin, link, fetched_at AS fetchedAt
    FROM products WHERE barcode = ?
  `),
  upsertProduct: db.prepare(`
    INSERT OR REPLACE INTO products
      (barcode, name, quantity, composition, kcal100, protein100, fat100, carbs100,
       nutrition_estimated, origin, link, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  // fetched_at не меняем: оценка сделана по тем же данным базы, их срок не продлевается.
  updateNutritionEstimate: db.prepare(`
    UPDATE products SET kcal100 = ?, protein100 = ?, fat100 = ?, carbs100 = ?, nutrition_estimated = 1
    WHERE barcode = ?
  `),
};

export function getCachedProduct(barcode: string): CachedProduct | null {
  const row = queries.selectProduct.get(barcode) as ProductRow | undefined;
  if (!row) return null;
  const { fetchedAt, nutritionEstimated, ...product } = row;
  return {
    product: { ...product, nutritionEstimated: nutritionEstimated === 1 },
    fetchedAt: new Date(fetchedAt),
  };
}

export function cacheProduct(product: Product, fetchedAt: Date = new Date()): void {
  queries.upsertProduct.run(
    product.barcode, product.name, product.quantity, product.composition,
    product.kcal100, product.protein100, product.fat100, product.carbs100,
    product.nutritionEstimated ? 1 : 0, product.origin, product.link, fetchedAt.toISOString(),
  );
}

export function saveNutritionEstimate(product: ProductWithNutrition): void {
  queries.updateNutritionEstimate.run(
    product.kcal100, product.protein100, product.fat100, product.carbs100, product.barcode,
  );
}
