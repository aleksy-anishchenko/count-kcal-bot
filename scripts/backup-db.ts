// Бэкап базы раз в сутки по cron: node --env-file=.env scripts/backup-db.ts /backups
// cp при WAL-режиме небезопасен — свежие записи могут лежать в kcal.db-wal. backup() из node:sqlite
// снимает целостную копию, даже пока бот пишет в базу.

import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import { config } from '../src/config.ts';
import { dayKey } from '../src/utils/days.ts';

const KEEP_COPIES = 30;
const BACKUP_NAME_RE = /^kcal-\d{4}-\d{2}-\d{2}\.db$/;

const backupDir = process.argv[2];
if (!backupDir) {
  console.error('Укажи папку для копий: node --env-file=.env scripts/backup-db.ts /backups');
  process.exit(1);
}
// new DatabaseSync на несуществующий файл молча создал бы пустую базу.
if (!existsSync(config.dbPath)) {
  console.error(`Базы ${config.dbPath} нет — проверь DB_PATH.`);
  process.exit(1);
}

mkdirSync(backupDir, { recursive: true });
const target = join(backupDir, `kcal-${dayKey()}.db`);
const db = new DatabaseSync(config.dbPath, { timeout: 5000 });
const pages = await backup(db, target);
db.close();
console.log(`Бэкап готов: ${target} (${pages} стр.)`);

// Имена с датой сортируются как строки по времени.
const copies = readdirSync(backupDir).filter((name) => BACKUP_NAME_RE.test(name)).sort();
for (const name of copies.slice(0, -KEEP_COPIES)) {
  rmSync(join(backupDir, name));
  console.log(`Удалена старая копия: ${name}`);
}
