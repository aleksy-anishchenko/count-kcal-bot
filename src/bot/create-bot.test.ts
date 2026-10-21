// Бот целиком: Telegram подменён (fake-telegram.ts), DeepSeek и базы товаров — подменой fetch.
// Тесты делят одну базу в памяти и идут по порядку: например, «Отменить» отменяет запись из теста выше.
// В .env.test ALLOWED_USER_IDS=1: пользователь 1 — свой, остальные — чужие.
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareZXingModule, writeBarcode } from 'zxing-wasm/writer';
import { createBot } from './create-bot.ts';
import { buttonData, callbackAnswers, connectFakeTelegram, editedTexts, hasCall, sentText } from './fake-telegram.ts';

for (const method of ['log', 'warn', 'error'] as const) mock.method(console, method, () => {});

const wasm = readFileSync(new URL(import.meta.resolve('zxing-wasm/writer/zxing_writer.wasm')));
prepareZXingModule({ overrides: { wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) } });
const barcodeImage = async (code: string) =>
  new Uint8Array(await (await writeBarcode(code, { format: 'EAN-13' })).image!.arrayBuffer());

const YOGURT = '4810268031793';     // есть в Open Food Facts с калориями
const TALITSKY = '4607009780696';   // есть в Роскачестве, без калорий; нейросеть оценит
const SVETAEVO = '4607003723705';   // есть в Роскачестве, без калорий; нейросеть оценить не сможет
const NUTELLA = '3017620422003';    // нет нигде

/** file_id → байты картинки, их отдаёт подменённый fetch. */
const files: Record<string, Uint8Array> = {
  yogurt: await barcodeImage(YOGURT),
  talitsky: await barcodeImage(TALITSKY),
  svetaevo: await barcodeImage(SVETAEVO),
  // 1×1 пиксель без штрихкода — «фото блюда».
  dish: new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')),
};

type ChatRequest = { messages: { content: string | { type: string }[] }[] };
/** Ответы «нейросети» по очереди. Пустая очередь — запрос не ожидался. */
const aiAnswers: ((request: ChatRequest) => Response)[] = [];
let aiRequests = 0;
let offRequests = 0;

const aiReply = (answer: object, finishReason = 'stop') => () => Response.json({
  choices: [{ message: { content: JSON.stringify(answer) }, finish_reason: finishReason }],
  usage: { prompt_tokens: 1000, completion_tokens: 50, prompt_cache_hit_tokens: 600 },
});
const imagesIn = (request: ChatRequest): number => {
  const content = request.messages[1].content;
  return Array.isArray(content) ? content.filter((block) => block.type === 'image_url').length : 0;
};

mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
  if (url.startsWith('https://api.deepseek.com')) {
    aiRequests++;
    const answer = aiAnswers.shift();
    if (!answer) return new Response('тест не ждал запроса в нейросеть', { status: 400 });
    return answer(JSON.parse(init?.body as string) as ChatRequest);
  }
  if (url.startsWith('https://api.telegram.org/file/')) return new Response(files[url.split('/').pop()!]);
  if (url.startsWith('https://world.openfoodfacts.org')) {
    offRequests++;
    if (!url.includes(YOGURT)) return new Response('', { status: 404 });
    return Response.json({ status: 1, product: { product_name_ru: 'Греческий йогурт', brands: 'Teos', quantity: '250 г',
      nutriments: { 'energy-kcal_100g': 66.8, proteins_100g: 8, fat_100g: 2, carbohydrates_100g: 4.2 } } });
  }
  if (url.startsWith('https://rskrf.ru')) {
    const title = url.includes(TALITSKY) ? 'Йогурт «клубника» 3% «Талицкий»' : url.includes(SVETAEVO) ? 'Творог «Светаево»' : null;
    if (!title) return Response.json({ response: {}, message: [] });
    return Response.json({ response: { title, product_link: 'https://rskrf.ru/goods/x/', product_info: [{ name: 'Вес', info: '125 г' }] } });
  }
  throw new Error(`тест не ждал запроса ${url}`);
});

const telegram = connectFakeTelegram(createBot('test-token'));

test('/start — справка', async () => {
  assert.match(sentText(await telegram.sendText('/start')), /Я считаю калории/);
});

test('в группе бот молчит', async () => {
  assert.deepEqual(await telegram.sendText('банан', { chatType: 'group' }), []);
});

test('чужой пользователь: доступ закрыт и для сообщений, и для кнопок', async () => {
  assert.match(sentText(await telegram.sendText('банан', { userId: 2 })), /Доступ закрыт. Твой id: 2/);
  assert.deepEqual(callbackAnswers(await telegram.pressButton('undo:1', 2)), ['⛔ Доступ закрыт']);
});

test('пустой дневник: /today, /undo, /clear', async () => {
  assert.match(sentText(await telegram.sendText('/today')), /записей пока нет/);
  assert.match(sentText(await telegram.sendText('/undo')), /Удалять нечего/);
  assert.match(sentText(await telegram.sendText('/clear')), /удалять нечего/);
});

test('стикер, PDF, неизвестная команда, устаревшая кнопка', async () => {
  assert.match(sentText(await telegram.sendSticker()), /Понимаю только текст и фото/);
  assert.match(sentText(await telegram.sendDocument('doc', 'application/pdf')), /Понимаю только текст и фото/);
  assert.match(sentText(await telegram.sendText('/foo')), /Не знаю такую команду/);
  assert.deepEqual(callbackAnswers(await telegram.pressButton('something-old')), ['Эта кнопка устарела.']);
});

let bananaUndo = '';

test('текст → запись, итог дня, кнопка «Отменить», «печатает…»', async () => {
  aiAnswers.push(aiReply({ food: [{ name: 'банан', amount: '1 шт', kcal: 90, protein: 1, fat: 0, carbs: 23 }] }));
  const calls = await telegram.sendText('банан');
  assert.match(sentText(calls), /✅ Записал[\s\S]*банан — 1 шт — 90 ккал[\s\S]*Итого за сегодня: 90 ккал/);
  assert.doesNotMatch(sentText(calls), /Точно такое же/);
  assert.ok(hasCall(calls, 'sendChatAction'));
  bananaUndo = buttonData(calls)[0];
  assert.match(bananaUndo, /^undo:\d+$/);
});

test('тот же текст повторно — предупреждение о дубле', async () => {
  aiAnswers.push(aiReply({ food: [{ name: 'банан', amount: '1 шт', kcal: 90, protein: 1, fat: 0, carbs: 23 }] }));
  assert.match(sentText(await telegram.sendText('банан')), /⚠️ Точно такое же сообщение уже записано/);
});

test('ошибки нейросети: «ошибка нейросети» и «слишком длинный список»', async () => {
  aiAnswers.push(() => new Response('{"error":"unauthorized"}', { status: 401 }));
  assert.match(sentText(await telegram.sendText('яблоко')), /ошибка нейросети/);
  aiAnswers.push(aiReply({ food: [] }, 'length'));
  assert.match(sentText(await telegram.sendText('много еды')), /Слишком длинный список/);
});

test('текст без еды', async () => {
  aiAnswers.push(aiReply({ food: [] }));
  assert.match(sentText(await telegram.sendText('сходил в зал')), /Не нашёл еды в сообщении/);
});

test('ни один продукт в тексте не оценён: не записываем, называем продукты', async () => {
  aiAnswers.push(aiReply({ food: [{ name: 'домашнее печенье', amount: '2 шт', kcal: null }] }));
  const calls = await telegram.sendText('домашнее печенье');
  assert.match(sentText(calls), /Не смог оценить калории: домашнее печенье\. Уточни, что это и сколько/);
  assert.deepEqual(buttonData(calls), []);
});

test('слишком длинный текст в нейросеть не уходит', async () => {
  const before = aiRequests;
  assert.match(sentText(await telegram.sendText('а'.repeat(1501))), /Слишком длинное сообщение: 1501 символ,/);
  assert.equal(aiRequests, before);
});

test('/today и /week с записями', async () => {
  assert.match(sentText(await telegram.sendText('/today')), /банан[\s\S]*банан[\s\S]*Итого: 180 ккал/);
  assert.match(sentText(await telegram.sendText('/week')), /📊 Последние 7 дней[\s\S]*Среднее: пока нет записей за прошлые дни/);
});

test('/stats считает все ответы нейросети с токенами, включая обрезанный', async () => {
  // банан, банан, «много еды» (обрезан), «сходил в зал», печенье — 5 ответов по 1000 токенов на входе.
  assert.match(sentText(await telegram.sendText('/stats')), /Сегодня: 5 запросов, на входе 5\s000 токенов \(из кэша 3\s000\), на выходе 250/);
});

test('кнопка «Отменить»: удаляет свою запись и убирает кнопку; второй раз — «уже удалена»', async () => {
  const calls = await telegram.pressButton(bananaUndo);
  assert.match(sentText(calls), /↩️ Удалил запись от .*\nбанан\n[\s\S]*Итого за сегодня: 90 ккал/);
  assert.ok(hasCall(calls, 'editMessageReplyMarkup'));
  assert.deepEqual(callbackAnswers(await telegram.pressButton(bananaUndo)), ['Эта запись уже удалена.']);
});

test('штрихкод из Open Food Facts: вся упаковка, без нейросети', async () => {
  const calls = await telegram.sendPhoto('yogurt');
  assert.match(sentText(calls), /Teos Греческий йогурт — вся упаковка, 250 г — 167 ккал[\s\S]*📦 Числа с упаковки по базе Open Food Facts\./);
  assert.equal(offRequests, 1);
});

test('тот же штрихкод с подписью «150 г»: из кэша, без баз', async () => {
  assert.match(sentText(await telegram.sendPhoto('yogurt', '150 г')), /150 г — 100 ккал/);
  assert.equal(offRequests, 1);
});

test('штрихкод и «съел половину»: порцию считает нейросеть, без картинки', async () => {
  aiAnswers.push((request) => {
    assert.equal(imagesIn(request), 0);
    return aiReply({ food: [{ name: 'Teos Греческий йогурт', amount: '125 г', kcal: 84, protein: 10, fat: 2.5, carbs: 5.3 }] })();
  });
  assert.match(sentText(await telegram.sendPhoto('yogurt', 'съел половину')), /125 г — 84 ккал[\s\S]*по базе Open Food Facts/);
});

test('штрихкод и непонятная порция: просим граммы, ничего не записываем', async () => {
  aiAnswers.push(aiReply({ food: [] }));
  const calls = await telegram.sendPhoto('yogurt', 'пару ложек');
  assert.match(sentText(calls), /Нашёл по штрихкоду: Teos Греческий йогурт\. Не понял, какую порцию посчитать[\s\S]*«150 г»/);
  assert.deepEqual(buttonData(calls), []);
});

test('товар Роскачества без калорий: нейросеть оценивает на 100 г, пометка и ссылка', async () => {
  aiAnswers.push(aiReply({ food: [{ name: 'Йогурт', amount: '100 г', kcal: 80, protein: 3, fat: 3, carbs: 10 }] }));
  assert.match(sentText(await telegram.sendPhoto('talitsky')),
    /Талицкий» — вся упаковка, 125 г — 100 ккал[\s\S]*калории оценены по названию\. https:\/\/rskrf\.ru\/goods\/x\//);
});

test('тот же товар повторно: оценка из кэша, нейросеть не нужна', async () => {
  const before = aiRequests;
  assert.match(sentText(await telegram.sendPhoto('talitsky', '250 г')), /250 г — 200 ккал/);
  assert.equal(aiRequests, before);
});

test('товар без калорий, нейросеть не оценила: не записываем, объясняем, ссылка на Роскачество', async () => {
  aiAnswers.push(aiReply({ food: [{ name: 'Творог', amount: '100 г', kcal: null }] }));
  const calls = await telegram.sendPhoto('svetaevo');
  assert.match(sentText(calls), /в базе Роскачества: Творог «Светаево»\. Калорий там нет[\s\S]*🏅 https:\/\/rskrf\.ru\/goods\/x\//);
  assert.deepEqual(buttonData(calls), []);
});

test('фото блюда: оценка по фото', async () => {
  aiAnswers.push((request) => {
    assert.equal(imagesIn(request), 1);
    return aiReply({ food: [{ name: 'борщ', amount: '300 г', kcal: 150, protein: 5, fat: 6, carbs: 18 }], source: 'estimate' })();
  });
  assert.match(sentText(await telegram.sendPhoto('dish')), /борщ[\s\S]*📷 Оценка по фото, приблизительная/);
});

test('фото без еды и штрихкод, которого нет в базах', async () => {
  aiAnswers.push(aiReply({ food: [{ name: 'продукт с этикетки', amount: null, kcal: null }], source: 'estimate' }));
  assert.match(sentText(await telegram.sendPhoto('dish')), /Не смог оценить еду на фото/);
  aiAnswers.push(aiReply({ food: [], source: 'estimate', barcode: NUTELLA }));
  assert.match(sentText(await telegram.sendPhoto('dish')), new RegExp(`Штрихкод ${NUTELLA} прочитал, но в базах`));
});

test('Telegram не отдал файл: «что-то пошло не так»', async () => {
  telegram.failMethod('getFile', 'Bad Request: file is too big');
  assert.match(sentText(await telegram.sendPhoto('dish')), /Что-то пошло не так/);
  telegram.restoreMethods();
});

test('картинка файлом (PNG): тот же поток, штрихкод читает декодер', async () => {
  assert.match(sentText(await telegram.sendDocument('yogurt', 'image/png')), /вся упаковка, 250 г — 167 ккал/);
});

test('картинка файлом больше 10 МБ: не скачиваем', async () => {
  const calls = await telegram.sendDocument('yogurt', 'image/jpeg', 11 * 1024 * 1024);
  assert.match(sentText(calls), /больше 10 МБ/);
  assert.ok(!hasCall(calls, 'getFile'));
});

test('альбом без штрихкодов: одна запись, все фото — одним запросом', async () => {
  aiAnswers.push((request) => {
    assert.equal(imagesIn(request), 2);
    return aiReply({ food: [{ name: 'суп', amount: '300 г', kcal: 120 }, { name: 'салат', amount: '150 г', kcal: 90 }], source: 'estimate' })();
  });
  const calls = await telegram.sendAlbum(['dish', 'dish'], 'обед');
  assert.equal(calls.filter((call) => call.method === 'sendMessage').length, 1);
  assert.match(sentText(calls), /суп[\s\S]*салат/);
});

test('альбом со штрихкодом на втором фото: товар из базы, без нейросети', async () => {
  const before = aiRequests;
  assert.match(sentText(await telegram.sendAlbum(['dish', 'yogurt'])), /вся упаковка, 250 г — 167 ккал/);
  assert.equal(aiRequests, before);
});

test('/clear: вопрос, «Отмена», «Да, удалить», повторное нажатие', async () => {
  const calls = await telegram.sendText('/clear');
  assert.match(sentText(calls), /Удалить все записи за .*\?\nЭто \d+ продукт(а|ов)? на \d+ ккал\./);
  const [confirm] = buttonData(calls);
  assert.match(confirm, /^clear:\d{4}-\d{2}-\d{2}:\d+$/);

  assert.deepEqual(editedTexts(await telegram.pressButton('clear:cancel')), ['Ок, ничего не удалял.']);
  assert.match(editedTexts(await telegram.pressButton(confirm))[0], /🗑 Удалил записи за/);
  assert.match(editedTexts(await telegram.pressButton(confirm))[0], /удалять уже нечего/);
  assert.match(sentText(await telegram.sendText('/undo')), /Удалять нечего/);
});

test('все ответы нейросети, которые ждал тест, использованы', () => {
  assert.equal(aiAnswers.length, 0);
});
