// API Роскачества (rskrf.ru/about/dev). Условие — активная ссылка на портал рядом с их данными.
// КБЖУ лежит текстом в карточке, и не у всех товаров, — достаём регулярками.
// Защита от ботов: первый запрос отвечает 302 с cookie (живёт 30 мин), с ним — 200.

import { toTrimmedString } from '../../utils/text.ts';
import type { Product } from '../product.ts';
import { USER_AGENT } from './user-agent.ts';

const API_URL = 'https://rskrf.ru/rest/1/search/barcode?barcode=';

let protectionCookie: string | null = null;

async function fetchWithCookie(url: string): Promise<Response> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await fetch(url, {
      redirect: 'manual', // сам fetch пошёл бы по редиректу без cookie — и так по кругу
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        ...(protectionCookie ? { Cookie: protectionCookie } : {}),
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status !== 302) return res;
    const setCookie = res.headers.get('set-cookie');
    if (!setCookie) break;
    protectionCookie = setCookie.split(';')[0]; // «__hash_=…» без атрибутов
  }
  throw new Error('Роскачество: не удалось пройти cookie-защиту');
}

/** null — товара нет; сетевые ошибки и прочие HTTP-статусы пробрасывает. */
export async function lookupRoskachestvo(barcode: string): Promise<Product | null> {
  const res = await fetchWithCookie(`${API_URL}${encodeURIComponent(barcode)}`);
  if (!res.ok) throw new Error(`Роскачество HTTP ${res.status}`);
  return parseRoskachestvoCard(barcode, await res.json());
}

type InfoRow = { name?: unknown; info?: unknown };

/** null — товара нет: {"response":{}}. */
export function parseRoskachestvoCard(barcode: string, data: unknown): Product | null {
  const response = (data as { response?: unknown } | null)?.response;
  if (!response || typeof response !== 'object') return null;
  const card = response as { title?: unknown; product_link?: unknown; product_info?: unknown };

  const name = typeof card.title === 'string' ? card.title.replace(/\s+/g, ' ').trim() : '';
  if (!name) return null;

  const rows = Array.isArray(card.product_info) ? (card.product_info as InfoRow[]) : [];
  const findInfo = (label: RegExp): string | null => {
    const row = rows.find((r) => typeof r.name === 'string' && label.test(r.name));
    return toTrimmedString(row?.info);
  };
  // КБЖУ может оказаться в любом поле карточки.
  const nutritionText = rows
    .map((row) => row.info)
    .filter((info): info is string => typeof info === 'string' && /пищев\w* ценност|ккал/i.test(info))
    .join(' ');
  const nutrition = parseNutritionText(nutritionText);

  return {
    barcode,
    name,
    quantity: findInfo(/^(вес|масса)/i),
    composition: findInfo(/^состав$/i),
    kcal100: nutrition?.kcal ?? null,
    protein100: nutrition?.protein ?? null,
    fat100: nutrition?.fat ?? null,
    carbs100: nutrition?.carbs ?? null,
    nutritionEstimated: false,
    origin: 'rskrf',
    link: typeof card.product_link === 'string' ? card.product_link : null,
  };
}

type Nutrition = { kcal: number; protein: number | null; fat: number | null; carbs: number | null };

// (?![а-яё]) — слово должно закончиться: «жирные кислоты» и «жирность» не считаются.
const PROTEIN_RE = /бел(?:ок|к[а-яё]*)(?![а-яё])\s*[-–—:]?\s*(\d+(?:[.,]\d+)?)/i;
const FAT_RE = /жир(?:ы|а|ов)?(?![а-яё])\s*[-–—:]?\s*(\d+(?:[.,]\d+)?)/i;
const CARBS_RE = /углевод(?:ы|а|ов)?(?![а-яё])\s*[-–—:]?\s*(\d+(?:[.,]\d+)?)/i;
// «630 кДж/150 ккал», «354 ккал/1480 кДж» — число прямо перед «ккал».
const KCAL_RE = /(\d+(?:[.,]\d+)?)\s*ккал/i;

const matchedNumber = (match: RegExpMatchArray | null): number | null =>
  (match ? parseFloat(match[1].replace(',', '.')) : null);

/** Нет калорий, но есть БЖУ — считаем по 4 ккал/г белков и углеводов и 9 ккал/г жиров. */
export function parseNutritionText(text: string): Nutrition | null {
  if (!text) return null;
  const protein = matchedNumber(text.match(PROTEIN_RE));
  const fat = matchedNumber(text.match(FAT_RE));
  const carbs = matchedNumber(text.match(CARBS_RE));
  let kcal = matchedNumber(text.match(KCAL_RE));
  if (kcal === null) {
    if (protein === null && fat === null && carbs === null) return null;
    kcal = Math.round(4 * (protein ?? 0) + 9 * (fat ?? 0) + 4 * (carbs ?? 0));
  }
  return { kcal, protein, fat, carbs };
}
