// База синхронная (DatabaseSync): синхронный код никто не прерывает, поэтому транзакции
// параллельных обработчиков не перемешиваются.

import { DatabaseSync } from 'node:sqlite';
import { config } from '../config.ts';
import { MIGRATIONS } from './migrations.ts';

// Если в базу пишет кто-то ещё (WebStorm, sqlite3), ждём до 5 с, а не падаем сразу
// с «database is locked» — иначе оплаченный ответ нейросети пропал бы.
export const db = new DatabaseSync(config.dbPath, { timeout: 5000 });

// На foreign_keys держится ON DELETE CASCADE. Внутри транзакции этот PRAGMA не действует —
// поэтому до миграций.
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
`);

export function transaction<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    // При некоторых ошибках SQLite откатывает транзакцию сам, и наш ROLLBACK подменил бы
    // настоящую ошибку своей «no transaction is active».
    if (db.isTransaction) db.exec('ROLLBACK');
    throw err;
  }
}

function migrate(): void {
  const { user_version: current } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  if (current > MIGRATIONS.length) {
    throw new Error(
      `База ${config.dbPath} новее кода: версия схемы ${current}, а код знает только ${MIGRATIONS.length}. Обнови бота.`,
    );
  }
  for (let version = current + 1; version <= MIGRATIONS.length; version++) {
    transaction(() => {
      db.exec(MIGRATIONS[version - 1]);
      // PRAGMA не принимает `?`; version — наше число, не ввод пользователя.
      db.exec(`PRAGMA user_version = ${version}`);
    });
    console.log(`База: применена миграция ${version}`);
  }
}

// До того, как entries.ts и product-cache.ts вызовут prepare(): на несозданной таблице он упал бы.
migrate();

/** При закрытии SQLite сливает WAL-журнал в основной файл. */
export function closeDb(): void {
  db.close();
}
