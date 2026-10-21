// Прячет токен бота в логах. Подключается первым импортом в main.ts, до всего, что может печатать.

import { formatWithOptions } from 'node:util';
import { config } from './config.ts';

// В сетевых ошибках grammY лежит URL запроса с токеном (api.telegram.org/bot<ТОКЕН>/…),
// и runner печатает их целиком.
for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
  const original = console[method].bind(console);
  console[method] = (...args: unknown[]) => {
    if (args.length === 0) return original();
    const [first, ...rest] = args;
    original(formatWithOptions({ colors: false }, first, ...rest).replaceAll(config.botToken, '***'));
  };
}

// Необработанную ошибку Node печатает сам, в обход console.
process.on('uncaughtException', (err) => {
  console.error(err);
  process.exit(1);
});
