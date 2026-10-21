import type { Product, ProductWithNutrition } from './product.ts';

export const yogurt: ProductWithNutrition = {
  barcode: '4810268031793', name: 'Teos Греческий йогурт', quantity: '250 г', composition: null,
  kcal100: 66.8, protein100: 8, fat100: 2, carbs100: 4.2, nutritionEstimated: false,
  origin: 'off', link: 'https://world.openfoodfacts.org/product/4810268031793',
};

export const productWithoutNutrition: Product = {
  barcode: '4607009780696', name: 'Йогурт «клубника» 3% «Талицкий»', quantity: '125 г', composition: 'Молоко, закваска',
  kcal100: null, protein100: null, fat100: null, carbs100: null, nutritionEstimated: false,
  origin: 'rskrf', link: 'https://rskrf.ru/goods/x/',
};
