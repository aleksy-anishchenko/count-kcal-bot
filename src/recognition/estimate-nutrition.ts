// Товар без калорий в базе: нейросеть оценивает их на 100 г один раз, оценка ложится в кэш,
// и следующие сканы считаются арифметикой.

import { saveNutritionEstimate } from '../db/product-cache.ts';
import type { Product, ProductWithNutrition } from '../products/product.ts';
import { buildEstimatePrompt } from '../products/product-prompt.ts';
import { recognizeFood } from './recognize-food.ts';

/** null — нейросеть не смогла оценить. */
export async function estimateNutrition(product: Product): Promise<ProductWithNutrition | null> {
  const { food } = await recognizeFood({ text: buildEstimatePrompt(product) });
  const per100g = food[0];
  if (!per100g || per100g.kcal === null) return null;

  const estimated: ProductWithNutrition = {
    ...product,
    kcal100: per100g.kcal,
    protein100: per100g.protein,
    fat100: per100g.fat,
    carbs100: per100g.carbs,
    nutritionEstimated: true,
  };
  saveNutritionEstimate(estimated);
  return estimated;
}
