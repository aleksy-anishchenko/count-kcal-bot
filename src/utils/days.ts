import { config } from '../config.ts';

const dayKeyFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: config.timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
});

/** 'YYYY-MM-DD' в таймзоне пользователя, а не сервера. */
export function dayKey(date: Date = new Date()): string {
  const parts = Object.fromEntries(dayKeyFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * Последние count дней, от старых к новым. `today` передают, если «сегодня» уже вычислено:
 * ровно в полночь два вызова dayKey() могли бы вернуть разные дни.
 */
export function lastDays(count: number, today: string = dayKey()): string[] {
  // В UTC от ключа дня — так не мешает перевод часов.
  const [year, month, day] = today.split('-').map(Number);
  const todayMs = Date.UTC(year, month - 1, day);
  return Array.from({ length: count }, (_, i) =>
    new Date(todayMs - (count - 1 - i) * 86_400_000).toISOString().slice(0, 10),
  );
}
