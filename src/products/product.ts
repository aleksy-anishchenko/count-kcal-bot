/** 'off' — Open Food Facts, 'rskrf' — Роскачество. Хранятся в базе, поэтому не переименовываются. */
export type ProductOrigin = 'off' | 'rskrf';

export type Product = {
  barcode: string;
  name: string;
  quantity: string | null;    // как в базе: «250 г», «400 g e»
  composition: string | null;
  // На 100 г. kcal100 null — чисел в базе нет, БЖУ тогда тоже null.
  kcal100: number | null;
  protein100: number | null;
  fat100: number | null;
  carbs100: number | null;
  /** true — kcal100…carbs100 оценила нейросеть, в базе чисел не было. */
  nutritionEstimated: boolean;
  origin: ProductOrigin;
  link: string | null;        // Роскачество требует ссылку на себя рядом с их данными
};

export type ProductWithNutrition = Product & { kcal100: number };

export const hasNutrition = (product: Product): product is ProductWithNutrition => product.kcal100 !== null;
