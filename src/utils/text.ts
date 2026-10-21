/** Строка без пробелов по краям; не строка или пустая строка → null. */
export function toTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** Array.from, а не slice: slice может разрезать эмодзи пополам. */
export function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : text;
}

const pluralRules = new Intl.PluralRules('ru-RU');

/** Форма слова для числа: [1 запрос, 2 запроса, 5 запросов]. */
export function pluralize(count: number, [one, few, many]: [string, string, string]): string {
  const form = pluralRules.select(count);
  return form === 'one' ? one : form === 'few' ? few : many;
}
