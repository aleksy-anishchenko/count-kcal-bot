import { config } from '../config.ts';
import type { DaySummary, EntryRow } from '../db/entries.ts';
import type { Product } from '../products/product.ts';
import type { FoodItem, NutritionSource } from '../recognition/types.ts';
import { dayKey } from '../utils/days.ts';
import { truncate } from '../utils/text.ts';

// Ключ дня — дата без времени, поэтому форматируем как UTC-полночь.
const dayFormatter = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: '2-digit' });

export const formatDay = (day: string): string => dayFormatter.format(new Date(`${day}T00:00:00Z`));

// А created_at — настоящий момент: показываем в таймзоне пользователя.
const timeFormatter = new Intl.DateTimeFormat('ru-RU', { timeZone: config.timeZone, hour: '2-digit', minute: '2-digit' });

export const formatTime = (date: Date): string => timeFormatter.format(date);

export const formatDayLabel = (day: string): string => (day === dayKey() ? 'сегодня' : formatDay(day));

export const formatNumber = (value: number | null | undefined): string =>
  (value == null ? '?' : String(Math.round(value)));

export function formatTotals(summary: DaySummary): string {
  const unknown = summary.unknownCount > 0 ? ` (⚠️ без оценки: ${summary.unknownCount})` : '';
  return `${formatNumber(summary.kcal)} ккал · Б ${formatNumber(summary.protein)} / ` +
    `Ж ${formatNumber(summary.fat)} / У ${formatNumber(summary.carbs)}${unknown}`;
}

export function formatFoodList(food: FoodItem[]): string {
  return food
    .map((item) => {
      const amount = item.amount ? ` — ${item.amount}` : '';
      return `• ${item.name}${amount} — ${formatNumber(item.kcal)} ккал ` +
        `(Б${formatNumber(item.protein)} / Ж${formatNumber(item.fat)} / У${formatNumber(item.carbs)})`;
    })
    .join('\n');
}

/** Для текста — null. Для Роскачества — обязательно со ссылкой: условие их API. */
export function formatSourceNote(source: NutritionSource, product: Product | null): string | null {
  if (product) {
    const estimated = source === 'name';
    if (product.origin === 'rskrf') {
      return (estimated
        ? '🏅 Товар опознан по штрихкоду в базе Роскачества, калории оценены по названию. '
        : '🏅 Числа с упаковки по данным Роскачества. ') + (product.link ?? 'https://rskrf.ru');
    }
    return estimated
      ? '📦 Товар опознан по штрихкоду в Open Food Facts, калории оценены по названию.'
      : '📦 Числа с упаковки по базе Open Food Facts.';
  }
  switch (source) {
    case 'label': return '📷 По этикетке.';
    case 'estimate': return '📷 Оценка по фото, приблизительная. Подпись с граммовкой сделает её точнее.';
    default: return null;
  }
}

/** `summary` — сводка дня уже после удаления. */
export function formatRemovedEntry(removed: EntryRow, summary: DaySummary): string {
  const when = `${formatDay(removed.day)} ${formatTime(new Date(removed.createdAt))}`;
  const dayLabel = formatDayLabel(removed.day);
  return [
    // Без кавычек вокруг текста: в нём бывают свои «». Длинный текст без обрезки не ушёл бы в Telegram.
    `↩️ Удалил запись от ${when}:\n${truncate(removed.text, 300)}`,
    '',
    summary.foodCount === 0
      ? `За ${dayLabel} записей больше нет.`
      : `Итого за ${dayLabel}: ${formatTotals(summary)}`,
  ].join('\n');
}
