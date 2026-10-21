// Первым: патч консоли должен встать раньше, чем остальные импорты что-нибудь напечатают.
import './hide-token-in-logs.ts';
import { setTimeout as sleep } from 'node:timers/promises';
import { run } from '@grammyjs/runner';
import { COMMAND_MENU } from './bot/command-menu.ts';
import { createBot } from './bot/create-bot.ts';
import { config } from './config.ts';
import { closeDb } from './db/connection.ts';

// DeepSeek обрывается через 60 с, так что нормальной обработке 70 с хватает.
const SHUTDOWN_TIMEOUT_MS = 70_000;

if (config.allowedUserIds.length === 0) {
  console.warn('⚠️ ALLOWED_USER_IDS пуст — ботом может пользоваться кто угодно и тратить баланс DeepSeek.');
}

const bot = createBot(config.botToken);
await bot.init();
await bot.api.setMyCommands(COMMAND_MENU)
  .catch((err) => console.error('Не удалось обновить меню команд:', err));

const runner = run(bot);
console.log(`Бот запущен как @${bot.botInfo.username}, TZ=${config.timeZone}`);

const stopRunner = () => {
  if (runner.isRunning()) void runner.stop();
};
process.once('SIGINT', stopRunner);
process.once('SIGTERM', stopRunner);

// Если runner упал (например, 409 — запущен второй экземпляр), не выходим сразу:
// сначала дорабатываем начатое и закрываем базу.
let crashed = false;
try {
  await runner.task();
} catch (err) {
  console.error('Runner упал:', err);
  crashed = true;
}

// stop() в runner 2.x не ждёт работающие обработчики, а они ещё могут писать в базу.
const deadline = Date.now() + SHUTDOWN_TIMEOUT_MS;
while (runner.size() > 0 && Date.now() < deadline) {
  await sleep(100);
}
closeDb();

// Зависший запрос держал бы процесс живым — выходим явно.
if (crashed || runner.size() > 0) process.exit(1);
