// Номер применённого шага база хранит в PRAGMA user_version; connection.ts применяет недостающие.
// Выпущенные миграции НЕ редактируем — новую дописываем в конец массива.

export const MIGRATIONS: string[] = [
  // 1. IF NOT EXISTS: у баз, созданных до появления миграций, таблицы уже есть при user_version 0.
  `
  -- Две таблицы: сообщение целиком (entries) и продукты из него (food).
  -- ON DELETE CASCADE: удалил запись из entries — её продукты удалятся сами (для /undo).
  CREATE TABLE IF NOT EXISTS entries (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    day        TEXT    NOT NULL,   -- 'YYYY-MM-DD' в таймзоне TZ
    created_at TEXT    NOT NULL,   -- ISO-строка в UTC, момент отправки сообщения
    text       TEXT    NOT NULL    -- исходное сообщение, показываем в /undo
  );
  CREATE INDEX IF NOT EXISTS entries_user_day ON entries (user_id, day);

  CREATE TABLE IF NOT EXISTS food (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    name     TEXT    NOT NULL,
    amount   TEXT,
    kcal     REAL,
    protein  REAL,
    fat      REAL,
    carbs    REAL
  );
  -- Без индекса JOIN с entries и каскадное удаление в /undo перебирают всю таблицу food.
  CREATE INDEX IF NOT EXISTS food_entry ON food (entry_id);

  -- Осталась от ранней версии с тренировками.
  DROP TABLE IF EXISTS workout;
  `,

  // 2. Кэш товаров Open Food Facts (их условие: один запрос = одно реальное сканирование).
  `
  CREATE TABLE products (
    barcode    TEXT PRIMARY KEY,  -- EAN-13 (UPC-A дополнен нулём слева)
    name       TEXT NOT NULL,
    quantity   TEXT,              -- вес упаковки как в базе: «250 г», «400 g e»
    kcal100    REAL NOT NULL,     -- всё на 100 г
    protein100 REAL,
    fat100     REAL,
    carbs100   REAL,
    fetched_at TEXT NOT NULL      -- когда скачали: пригодится, если захотим обновлять устаревшие
  );
  `,

  // 3. Роскачество: калорий может не быть. SQLite не снимает NOT NULL через ALTER — пересоздаём таблицу.
  `
  CREATE TABLE products_new (
    barcode     TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    quantity    TEXT,
    composition TEXT,
    kcal100     REAL,               -- NULL: в базе нет чисел, калории оценивает нейросеть по названию
    protein100  REAL,
    fat100      REAL,
    carbs100    REAL,
    origin      TEXT NOT NULL,      -- 'off' | 'rskrf'
    link        TEXT,
    fetched_at  TEXT NOT NULL
  );
  INSERT INTO products_new (barcode, name, quantity, kcal100, protein100, fat100, carbs100, origin, fetched_at)
    SELECT barcode, name, quantity, kcal100, protein100, fat100, carbs100, 'off', fetched_at FROM products;
  DROP TABLE products;
  ALTER TABLE products_new RENAME TO products;
  `,

  // 4. Оценка нейросети на 100 г для товаров без калорий хранится в тех же kcal100…carbs100.
  `
  ALTER TABLE products ADD COLUMN nutrition_estimated INTEGER NOT NULL DEFAULT 0;  -- 1: числа оценила нейросеть
  `,

  // 5. Расход токенов DeepSeek по дням, для /stats.
  `
  CREATE TABLE ai_usage (
    day                  TEXT PRIMARY KEY,   -- 'YYYY-MM-DD' в таймзоне TZ
    requests             INTEGER NOT NULL,
    prompt_tokens        INTEGER NOT NULL,   -- на входе: промпт, текст, картинки
    cached_prompt_tokens INTEGER NOT NULL,   -- из них попали в кэш DeepSeek (дешевле)
    completion_tokens    INTEGER NOT NULL    -- на выходе: ответ модели
  );
  `,

  // 6. /stats убран: расход токенов виден на platform.deepseek.com.
  `
  DROP TABLE ai_usage;
  `,
];
