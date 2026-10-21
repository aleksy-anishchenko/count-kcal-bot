import type { FoodItem } from '../recognition/types.ts';
import { dayKey } from '../utils/days.ts';
import { db, transaction } from './connection.ts';

export type FoodRow = FoodItem & { id: number };

export type EntryRow = {
  id: number;
  day: string;
  /** Момент отправки сообщения, ISO-строка в UTC. */
  createdAt: string;
  text: string;
};

export type DaySummary = {
  day: string;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  foodCount: number;
};

const ENTRY_COLUMNS = 'id, day, created_at AS createdAt, text';

const queries = {
  insertEntry: db.prepare('INSERT INTO entries (user_id, day, created_at, text) VALUES (?, ?, ?, ?)'),
  insertFood: db.prepare(
    'INSERT INTO food (entry_id, name, amount, kcal, protein, fat, carbs) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ),

  selectFoodOfDay: db.prepare(`
    SELECT f.id, f.name, f.amount, f.kcal, f.protein, f.fat, f.carbs
    FROM food f JOIN entries e ON e.id = f.entry_id
    WHERE e.user_id = ? AND e.day = ?
    ORDER BY f.id
  `),

  selectTotalsByDay: db.prepare(`
    SELECT e.day,
           SUM(f.kcal)    AS kcal,
           SUM(f.protein) AS protein,
           SUM(f.fat)     AS fat,
           SUM(f.carbs)   AS carbs,
           COUNT(*)       AS foodCount
    FROM food f JOIN entries e ON e.id = f.entry_id
    WHERE e.user_id = ? AND e.day BETWEEN ? AND ?
    GROUP BY e.day
  `),

  deleteLastEntry: db.prepare(`
    DELETE FROM entries
    WHERE id = (SELECT MAX(id) FROM entries WHERE user_id = ?)
    RETURNING ${ENTRY_COLUMNS}
  `),
  deleteEntryOfUser: db.prepare(`DELETE FROM entries WHERE id = ? AND user_id = ? RETURNING ${ENTRY_COLUMNS}`),
  selectLastEntryIdOfDay: db.prepare('SELECT MAX(id) AS id FROM entries WHERE user_id = ? AND day = ?'),
  // `id <= ?` — записи, добавленные после вопроса «Удалить все записи?», не трогаем.
  deleteDayEntries: db.prepare('DELETE FROM entries WHERE user_id = ? AND day = ? AND id <= ?'),

  // ISO-строки одного формата можно сравнивать как строки.
  selectDuplicate: db.prepare(`
    SELECT ${ENTRY_COLUMNS} FROM entries
    WHERE user_id = ? AND text = ? AND created_at >= ?
    ORDER BY id DESC LIMIT 1
  `),
};

export function addEntry(userId: number, text: string, food: FoodItem[], sentAt: Date): { id: number; day: string } {
  const day = dayKey(sentAt);
  return transaction(() => {
    const { lastInsertRowid } = queries.insertEntry.run(userId, day, sentAt.toISOString(), text);
    const id = Number(lastInsertRowid);
    for (const item of food) {
      queries.insertFood.run(id, item.name, item.amount, item.kcal, item.protein, item.fat, item.carbs);
    }
    return { id, day };
  });
}

export function getDayFood(userId: number, day: string): FoodRow[] {
  return queries.selectFoodOfDay.all(userId, day) as FoodRow[];
}

/**
 * Сводка по каждому дню, дни без записей — с нулями.
 * Контракт: `days` по возрастанию и подряд, как их отдаёт lastDays — внутри один запрос с BETWEEN.
 */
export function getDaySummaries(userId: number, days: string[]): DaySummary[] {
  const from = days[0];
  const to = days[days.length - 1];

  // SUM от одних NULL даёт NULL.
  type TotalsRow = Omit<DaySummary, 'kcal' | 'protein' | 'fat' | 'carbs'> &
    { kcal: number | null; protein: number | null; fat: number | null; carbs: number | null };

  const totalsByDay = new Map(
    (queries.selectTotalsByDay.all(userId, from, to) as TotalsRow[]).map((row) => [row.day, row]),
  );

  return days.map((day) => {
    const totals = totalsByDay.get(day);
    return {
      day,
      kcal: totals?.kcal ?? 0,
      protein: totals?.protein ?? 0,
      fat: totals?.fat ?? 0,
      carbs: totals?.carbs ?? 0,
      foodCount: totals?.foodCount ?? 0,
    };
  });
}

export function getDaySummary(userId: number, day: string): DaySummary {
  return getDaySummaries(userId, [day])[0];
}

/** Запись с тем же текстом, присланная не раньше `since`, или null. */
export function findDuplicateEntry(userId: number, text: string, since: Date): EntryRow | null {
  return (queries.selectDuplicate.get(userId, text, since.toISOString()) as EntryRow | undefined) ?? null;
}

export function deleteLastEntry(userId: number): EntryRow | null {
  return (queries.deleteLastEntry.get(userId) as EntryRow | undefined) ?? null;
}

export function deleteEntryById(userId: number, entryId: number): EntryRow | null {
  // entryId приходит из данных кнопки, а их присылает клиент — по чужому id чужую запись не удалить.
  return (queries.deleteEntryOfUser.get(entryId, userId) as EntryRow | undefined) ?? null;
}

export function getLastEntryIdOfDay(userId: number, day: string): number | null {
  const row = queries.selectLastEntryIdOfDay.get(userId, day) as { id: number | null };
  return row.id;
}

/** Удаляет записи дня с id ≤ upToId, возвращает их количество. */
export function deleteDayEntries(userId: number, day: string, upToId: number): number {
  return Number(queries.deleteDayEntries.run(userId, day, upToId).changes);
}
