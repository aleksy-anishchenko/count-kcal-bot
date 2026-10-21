import type { Product, ProductWithNutrition } from './product.ts';

function describeProduct(product: Product): string[] {
  const lines = [
    `Продукт по штрихкоду: ${product.name}.`,
    `Упаковка: ${product.quantity ?? 'вес не указан'}.`,
  ];
  if (product.composition) lines.push(`Состав: ${product.composition}.`);
  return lines;
}

/** Для подписи без граммов («съел половину»): порцию считает нейросеть по числам на 100 г. */
export function buildPortionPrompt(product: ProductWithNutrition, caption: string): string {
  const valueOrUnknown = (value: number | null): string => (value === null ? '?' : String(value));
  return [
    ...describeProduct(product),
    `На 100 г: ${product.kcal100} ккал, белки ${valueOrUnknown(product.protein100)} г, ` +
      `жиры ${valueOrUnknown(product.fat100)} г, углеводы ${valueOrUnknown(product.carbs100)} г.`,
    `Пользователь написал: «${caption}». Посчитай съеденную порцию этого продукта.`,
    'Название продукта возьми как есть.',
  ].join('\n');
}

/** На 100 г, а не на порцию: такую оценку можно закэшировать и пересчитать на любую порцию. */
export function buildEstimatePrompt(product: Product): string {
  return [
    ...describeProduct(product),
    'Пищевой ценности в базе нет: оцени калории и БЖУ на 100 г по названию и составу.',
    'Ответь одним продуктом: название возьми как есть, amount — «100 г».',
  ].join('\n');
}
