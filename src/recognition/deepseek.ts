// DeepSeek совместим с OpenAI API, поэтому хватает fetch без SDK.

import { setTimeout as sleep } from 'node:timers/promises';
import { config } from '../config.ts';

const API_URL = 'https://api.deepseek.com/chat/completions';

const TIMEOUT_MS = 60_000;

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAY_MS = 2000;

export type ChatCompletion = {
  choices?: { message?: { content?: string }; finish_reason?: string }[];
  /** prompt_cache_hit_tokens — часть входа из кэша DeepSeek, она дешевле. */
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_cache_hit_tokens?: number };
};

/** Один повтор при временной ошибке. Таймаут не повторяем: 60 с уже прошли, пользователь ждёт. */
export async function postChatCompletion(body: unknown): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const isLastAttempt = attempt === 2;
    let res: Response;
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.deepseekApiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === 'TimeoutError';
      if (isLastAttempt || isTimeout) throw err;
      console.warn('DeepSeek: сетевая ошибка, повторяю через 2 с:', err);
      await sleep(RETRY_DELAY_MS);
      continue;
    }
    if (!isLastAttempt && RETRY_STATUSES.has(res.status)) {
      console.warn(`DeepSeek HTTP ${res.status}, повторяю через 2 с`);
      await sleep(RETRY_DELAY_MS);
      continue;
    }
    return res;
  }
}
