import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Product, ProductWithNutrition } from '../products/product.ts';
import { productWithoutNutrition, yogurt } from '../products/test-fixtures.ts';
import { AiError, type RecognitionInput } from './recognize-food.ts';
import { recognizePhoto, type PhotoSteps } from './recognize-photo.ts';
import type { FoodItem, Recognition } from './types.ts';

mock.method(console, 'log', () => {});

/** Заглушка декодера узнаёт картинку по первому байту. */
const image = (n: number) => ({ bytes: new Uint8Array([n]), mime: 'image/jpeg' as const });
const photo = (caption?: string) => ({ images: [image(0)], caption });

const food = (kcal: number | null): FoodItem[] =>
  [{ name: 'еда', amount: '100 г', kcal, protein: 1, fat: 1, carbs: 1 }];

const estimated = (product: Product): ProductWithNutrition =>
  ({ ...product, kcal100: 80, protein100: 3, fat100: 3, carbs100: 10, nutritionEstimated: true });

/** Заглушки шагов; заодно запоминают, с чем их вызывали. */
function fakeSteps({ barcodes = [], products = {}, aiAnswers = [], canEstimate = true }: {
  barcodes?: (string | null)[];
  products?: Record<string, Product>;
  aiAnswers?: Recognition[];
  canEstimate?: boolean;
}) {
  const aiCalls: RecognitionInput[] = [];
  const lookups: string[] = [];
  const estimates: string[] = [];
  const steps: PhotoSteps = {
    readBarcode: async (bytes) => barcodes[bytes[0]] ?? null,
    findProduct: async (code) => {
      lookups.push(code);
      return products[code] ?? null;
    },
    recognizeFood: async (input) => {
      aiCalls.push(input);
      const answer = aiAnswers.shift();
      if (!answer) throw new Error('нейросеть вызвана больше раз, чем ожидал тест');
      return answer;
    },
    estimateNutrition: async (product) => {
      estimates.push(product.barcode);
      return canEstimate ? estimated(product) : null;
    },
  };
  return { steps, aiCalls, lookups, estimates };
}

test('штрихкод прочитан, товар с калориями: считаем по базе, нейросеть не нужна', async () => {
  const { steps, aiCalls } = fakeSteps({ barcodes: [yogurt.barcode], products: { [yogurt.barcode]: yogurt } });
  const result = await recognizePhoto(photo(), steps);

  // assert.ok сужает тип: дальше result точно 'recognized'.
  assert.ok(result.status === 'recognized');
  assert.equal(result.product, yogurt);
  assert.equal(result.recognition.source, 'barcode');
  assert.equal(result.recognition.food[0].amount, 'вся упаковка, 250 г');
  assert.equal(aiCalls.length, 0);
});

test('товар с калориями и подпись без граммов: нейросеть считает порцию по числам из базы, без фото', async () => {
  const { steps, aiCalls } = fakeSteps({
    barcodes: [yogurt.barcode],
    products: { [yogurt.barcode]: yogurt },
    aiAnswers: [{ food: food(83), source: 'text', barcode: null }],
  });
  const result = await recognizePhoto(photo('съел половину'), steps);

  assert.ok(result.status === 'recognized');
  assert.equal(result.recognition.source, 'barcode');
  assert.equal(result.recognition.barcode, yogurt.barcode);
  assert.equal(aiCalls[0].images, undefined);
  assert.match(aiCalls[0].text ?? '', /66\.8 ккал/);
  assert.match(aiCalls[0].text ?? '', /«съел половину»/);
});

test('товар без калорий: нейросеть оценивает их на 100 г, порцию считаем арифметикой, source «name»', async () => {
  const { steps, aiCalls, estimates } = fakeSteps({
    barcodes: [productWithoutNutrition.barcode],
    products: { [productWithoutNutrition.barcode]: productWithoutNutrition },
  });
  const result = await recognizePhoto(photo(), steps);

  assert.ok(result.status === 'recognized');
  assert.equal(result.recognition.source, 'name');
  assert.equal(result.recognition.food[0].amount, 'вся упаковка, 125 г');
  assert.equal(result.recognition.food[0].kcal, 100); // 80 ккал на 100 г × 125 г
  assert.equal(result.product?.nutritionEstimated, true);
  assert.deepEqual(estimates, [productWithoutNutrition.barcode]);
  assert.equal(aiCalls.length, 0); // оценка — отдельный шаг, recognizeFood не нужен
});

test('товар без калорий и подпись без граммов: оценка на 100 г, потом порцию считает нейросеть', async () => {
  const { steps, aiCalls } = fakeSteps({
    barcodes: [productWithoutNutrition.barcode],
    products: { [productWithoutNutrition.barcode]: productWithoutNutrition },
    aiAnswers: [{ food: food(40), source: 'text', barcode: null }],
  });
  const result = await recognizePhoto(photo('половину'), steps);

  assert.ok(result.status === 'recognized');
  assert.equal(result.recognition.source, 'name');
  assert.match(aiCalls[0].text ?? '', /На 100 г: 80 ккал/);
});

test('штрихкода нет: фото и подпись уходят в нейросеть, базы не спрашиваются', async () => {
  const { steps, aiCalls, lookups } = fakeSteps({ aiAnswers: [{ food: food(250), source: 'estimate', barcode: null }] });
  const result = await recognizePhoto(photo('это 300 г'), steps);

  assert.ok(result.status === 'recognized');
  assert.equal(result.product, null);
  assert.equal(result.recognition.source, 'estimate');
  assert.equal(aiCalls[0].text, 'это 300 г');
  assert.equal(aiCalls[0].images?.length, 1);
  assert.deepEqual(lookups, []);
});

test('альбом: декодер смотрит каждое фото, товар нашёлся на втором', async () => {
  const { steps, aiCalls, lookups } = fakeSteps({
    barcodes: [null, yogurt.barcode],
    products: { [yogurt.barcode]: yogurt },
  });
  const result = await recognizePhoto({ images: [image(0), image(1)], caption: undefined }, steps);

  assert.ok(result.status === 'recognized');
  assert.equal(result.product, yogurt);
  assert.deepEqual(lookups, [yogurt.barcode]);
  assert.equal(aiCalls.length, 0);
});

test('альбом без штрихкодов: все фото уходят в нейросеть одним запросом', async () => {
  const { steps, aiCalls } = fakeSteps({ aiAnswers: [{ food: food(500), source: 'estimate', barcode: null }] });
  const result = await recognizePhoto({ images: [image(0), image(1), image(2)], caption: 'обед' }, steps);

  assert.ok(result.status === 'recognized');
  assert.equal(aiCalls.length, 1);
  assert.equal(aiCalls[0].images?.length, 3);
});

test('декодер не прочитал, а модель разглядела цифры: товар из базы точнее оценки по фото', async () => {
  const { steps, aiCalls, lookups } = fakeSteps({
    products: { [yogurt.barcode]: yogurt },
    aiAnswers: [{ food: food(999), source: 'label', barcode: yogurt.barcode }],
  });
  const result = await recognizePhoto(photo(), steps);

  assert.ok(result.status === 'recognized');
  assert.equal(result.product, yogurt);
  assert.equal(result.recognition.source, 'barcode');
  assert.equal(result.recognition.food[0].kcal, 167); // 66.8 ккал × 250 г, а не 999 от модели
  assert.equal(aiCalls.length, 1);
  assert.deepEqual(lookups, [yogurt.barcode]);
});

test('модель прочитала другой штрихкод, чем декодер: ищем и его', async () => {
  const { steps, lookups } = fakeSteps({
    barcodes: ['4607003723705'],
    products: { [yogurt.barcode]: yogurt },
    aiAnswers: [{ food: food(null), source: 'estimate', barcode: yogurt.barcode }],
  });
  const result = await recognizePhoto(photo(), steps);

  assert.ok(result.status === 'recognized');
  assert.equal(result.product, yogurt);
  assert.deepEqual(lookups, ['4607003723705', yogurt.barcode]);
});

test('штрихкод прочитан, товара нет в базах, калорий нет: «unknown-barcode»', async () => {
  const { steps } = fakeSteps({
    barcodes: ['4607003723705'],
    aiAnswers: [{ food: food(null), source: 'estimate', barcode: null }],
  });
  assert.deepEqual(await recognizePhoto(photo(), steps), { status: 'unknown-barcode', barcode: '4607003723705' });
});

test('модель прочитала тот же штрихкод, что и декодер: базы второй раз не спрашиваем', async () => {
  const { steps, lookups } = fakeSteps({
    barcodes: ['4607003723705'],
    aiAnswers: [{ food: food(null), source: 'estimate', barcode: '4607003723705' }],
  });
  assert.deepEqual(await recognizePhoto(photo(), steps), { status: 'unknown-barcode', barcode: '4607003723705' });
  assert.deepEqual(lookups, ['4607003723705']);
});

test('ни штрихкода, ни еды: «nothing-recognized»', async () => {
  const { steps } = fakeSteps({ aiAnswers: [{ food: [], source: 'estimate', barcode: null }] });
  assert.deepEqual(await recognizePhoto(photo(), steps), { status: 'nothing-recognized' });
});

test('товар без калорий нашёл декодер, нейросеть не оценила: «product-not-estimated»', async () => {
  const { steps } = fakeSteps({
    barcodes: [productWithoutNutrition.barcode],
    products: { [productWithoutNutrition.barcode]: productWithoutNutrition },
    canEstimate: false,
  });
  assert.deepEqual(await recognizePhoto(photo(), steps), { status: 'product-not-estimated', product: productWithoutNutrition });
});

test('товар без калорий нашёлся по цифрам от модели и не оценён: «product-not-estimated», а не «товара нет»', async () => {
  const { steps } = fakeSteps({
    products: { [productWithoutNutrition.barcode]: productWithoutNutrition },
    aiAnswers: [{ food: [], source: 'estimate', barcode: productWithoutNutrition.barcode }],
    canEstimate: false,
  });
  assert.deepEqual(await recognizePhoto(photo(), steps), { status: 'product-not-estimated', product: productWithoutNutrition });
});

test('товар с калориями, подпись без граммов, нейросеть не поняла порцию: «product-not-estimated»', async () => {
  const { steps } = fakeSteps({
    barcodes: [yogurt.barcode],
    products: { [yogurt.barcode]: yogurt },
    aiAnswers: [{ food: [], source: 'text', barcode: null }],
  });
  assert.deepEqual(await recognizePhoto(photo('пару ложек'), steps), { status: 'product-not-estimated', product: yogurt });
});

test('ошибка нейросети не глотается: на неё отвечает error-handler', async () => {
  const { steps } = fakeSteps({});
  steps.recognizeFood = async () => {
    throw new AiError('DeepSeek HTTP 500');
  };
  await assert.rejects(recognizePhoto(photo(), steps), AiError);
});
