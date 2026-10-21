/** Числа — для всей съеденной порции, не на 100 г; БЖУ в граммах. */
export type FoodItem = {
  name: string;
  amount: string | null;   // «200 г», «1 шт», «1 стакан»
  kcal: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
};

/** Откуда числа. 'barcode' — из базы товаров, 'name' — оценка по названию товара; их ставит не модель. */
export type NutritionSource = 'text' | 'label' | 'estimate' | 'barcode' | 'name';

/** Сжатое фото Telegram — всегда JPEG; PNG бывает у картинки, отправленной файлом. */
export type Image = {
  bytes: Uint8Array;
  mime: 'image/jpeg' | 'image/png';
};

export type Recognition = {
  food: FoodItem[];
  source: NutritionSource;
  /** Цифры под штрихкодом, если модель разглядела их на фото; контрольная цифра проверена. */
  barcode: string | null;
};
