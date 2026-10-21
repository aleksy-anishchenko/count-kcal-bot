import { recordAiUsage } from '../db/ai-usage.ts';
import { postChatCompletion, type ChatCompletion } from './deepseek.ts';
import { normalizeRecognition } from './normalize.ts';
import { SYSTEM_PROMPT } from './prompt.ts';
import type { Image, Recognition } from './types.ts';

// Единственная модель DeepSeek с картинками. `deepseek-chat` — устаревший алиас, его отключают.
const MODEL = 'deepseek-flash';

export type RecognitionInput = {
  /** Текст сообщения или подпись к фото. */
  text?: string;
  images?: Image[];
};

/** Любая неудача запроса к нейросети; исходная ошибка — в `cause`. На неё отвечает bot/error-handler.ts. */
export class AiError extends Error {
  name = 'AiError';
}

/** Ответ не влез в max_tokens. Не временная ошибка: повтор того же текста упрётся в лимит снова. */
export class TruncatedResponseError extends AiError {
  name = 'TruncatedResponseError';
}

export async function recognizeFood(input: RecognitionInput): Promise<Recognition> {
  try {
    return await requestRecognition(input);
  } catch (err) {
    if (err instanceof AiError) throw err;
    throw new AiError(`DeepSeek: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
}

async function requestRecognition({ text, images = [] }: RecognitionInput): Promise<Recognition> {
  const hasImages = images.length > 0;
  const userContent = hasImages
    ? [
        { type: 'text', text: text || 'Определи еду на фото.' },
        ...images.map((image) => ({
          type: 'image_url',
          // Без detail: «low» сжал бы фото до 512 px и размазал бы шрифт этикетки.
          image_url: { url: `data:${image.mime};base64,${Buffer.from(image.bytes).toString('base64')}` },
        })),
      ]
    : (text ?? '');

  const res = await postChatCompletion({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
    max_tokens: 2000,
    // Размышления у deepseek-flash включены по умолчанию: для JSON они дороже, медленнее
    // и могли бы съесть max_tokens.
    thinking: { type: 'disabled' },
  });

  if (!res.ok) {
    throw new Error(`DeepSeek HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  const data = (await res.json()) as ChatCompletion;
  const choice = data.choices?.[0];

  // Токены списаны, даже если ответ дальше окажется обрезанным или мусорным.
  if (data.usage) {
    recordAiUsage({
      promptTokens: data.usage.prompt_tokens ?? 0,
      cachedPromptTokens: data.usage.prompt_cache_hit_tokens ?? 0,
      completionTokens: data.usage.completion_tokens ?? 0,
    });
  }

  if (choice?.finish_reason === 'length') {
    throw new TruncatedResponseError(
      `Ответ DeepSeek не влез в max_tokens (текст ${text?.length ?? 0} символов${hasImages ? `, фото: ${images.length}` : ''})`,
    );
  }

  const content = choice?.message?.content;
  if (!content) throw new Error('DeepSeek вернул пустой ответ');

  // В JSON-режиме ```json``` быть не должно, но бывает.
  const jsonText = content.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');

  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    throw new Error(`DeepSeek вернул не-JSON: ${jsonText.slice(0, 200)}`);
  }

  return normalizeRecognition(raw, hasImages);
}
