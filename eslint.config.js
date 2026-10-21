// recommendedTypeChecked смотрит на типы: например, ловит промис без await. Где промис не ждём
// намеренно, в коде стоит `void`.

import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['node_modules/'] },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    rules: {
      // test() из node:test возвращает промис, но ждать его не нужно.
      '@typescript-eslint/no-floating-promises': ['error', {
        allowForKnownSafeCalls: [{ from: 'package', package: 'node:test', name: ['test', 'describe', 'it', 'suite'] }],
      }],
    },
  },
  {
    // Заглушки в тестах — async без await: так они возвращают промис, как настоящие функции.
    files: ['**/*.test.ts'],
    rules: { '@typescript-eslint/require-await': 'off' },
  },
  {
    // Этот файл — JS вне tsconfig, правила с типами к нему не применимы.
    files: ['eslint.config.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
