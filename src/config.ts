// Единственное место, где читается process.env: всё проверяется при старте, а не при первом сообщении.

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} не задан в .env (см. .env.example)`);
  return value;
}

function parseUserIds(raw: string): number[] {
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      // Иначе опечатка вроде «@me» дала бы NaN и закрыла бы бота даже для владельца.
      if (!/^\d+$/.test(part)) {
        throw new Error(`ALLOWED_USER_IDS: «${part}» — не user id. Нужны числа через запятую, например 12345678,87654321`);
      }
      return Number(part);
    });
}

function validateTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
  } catch {
    throw new Error(`Неизвестная таймзона TZ="${timeZone}". Пример: TZ=Europe/Moscow`);
  }
  return timeZone;
}

export const config = {
  botToken: requireEnv('BOT_TOKEN'),
  deepseekApiKey: requireEnv('DEEPSEEK_API_KEY'),
  timeZone: validateTimeZone(process.env.TZ || 'UTC'),
  /** ':memory:' — база в памяти, так запускаются тесты. */
  dbPath: process.env.DB_PATH || './kcal.db',
  /** Пустой список — пускаем всех. */
  allowedUserIds: parseUserIds(process.env.ALLOWED_USER_IDS ?? ''),
} as const;
