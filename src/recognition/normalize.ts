// Формату от модели не доверяем: число может прийти строкой, поле — пропасть, элемент — оказаться мусором.

import { normalizeBarcode } from '../products/barcode.ts';
import { toTrimmedString } from '../utils/text.ts';
import type { FoodItem, NutritionSource, Recognition } from './types.ts';

/** Неотрицательное число или null. Понимает строки «9,5», «1 200», «1,200» и «260 ккал». */
function toNumber(value: unknown): number | null {
  let result: number;
  if (typeof value === 'number') {
    result = value;
  } else if (typeof value === 'string') {
    // \s ловит и неразрывный пробел, которым часто разделяют разряды.
    let digits = value.replace(/\s/g, '');
    // Запятая перед ровно тремя цифрами — разделитель тысяч, иначе десятичная.
    digits = /^\d{1,3}(,\d{3})+(?!\d)/.test(digits) ? digits.replace(/,/g, '') : digits.replace(',', '.');
    result = parseFloat(digits);
  } else {
    return null;
  }
  // Отрицательное значение уменьшило бы сумму за день.
  return Number.isFinite(result) && result >= 0 ? result : null;
}

function roundTo(value: number | null, digits = 0): number | null {
  if (value === null) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Бросает ошибку, если форма совсем не та. source и barcode от модели имеют смысл только с фото. */
export function normalizeRecognition(raw: unknown, hasImage = false): Recognition {
  const unexpectedShape = () => new Error(`DeepSeek вернул JSON неожиданной формы: ${JSON.stringify(raw).slice(0, 200)}`);
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw unexpectedShape();
  const response = raw as Record<string, unknown>;

  let rawItems: unknown[];
  if (Array.isArray(response.food)) {
    rawItems = response.food;
  } else if (response.food === null || Object.keys(response).length === 0) {
    // Так модель иногда отвечает на сообщение без еды («сходил в зал») — это не ошибка.
    rawItems = [];
  } else if (typeof response.food === 'object') {
    // Иногда один продукт приходит объектом, а не массивом.
    rawItems = [response.food];
  } else {
    throw unexpectedShape();
  }

  const food: FoodItem[] = [];
  for (const rawItem of rawItems) {
    if (rawItem === null || typeof rawItem !== 'object') continue;
    const fields = rawItem as Record<string, unknown>;
    const name = toTrimmedString(fields.name);
    if (!name) continue;
    food.push({
      name,
      amount: typeof fields.amount === 'number' ? String(fields.amount) : toTrimmedString(fields.amount),
      kcal: roundTo(toNumber(fields.kcal)),
      protein: roundTo(toNumber(fields.protein), 1),
      fat: roundTo(toNumber(fields.fat), 1),
      carbs: roundTo(toNumber(fields.carbs), 1),
    });
  }

  // Незнакомое значение — оценка «на глаз»: честнее, чем «по этикетке».
  const source: NutritionSource = !hasImage ? 'text' : response.source === 'label' ? 'label' : 'estimate';

  // Контрольная цифра обязательна: одна ошибка в чтении — и это был бы чужой товар.
  const rawBarcode = typeof response.barcode === 'string' ? response.barcode
    : typeof response.barcode === 'number' ? String(response.barcode) : null;
  const barcode = hasImage && rawBarcode ? normalizeBarcode(rawBarcode) : null;

  return { food, source, barcode };
}
