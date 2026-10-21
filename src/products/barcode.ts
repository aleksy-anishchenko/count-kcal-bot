import { readFileSync } from 'node:fs';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';

// По умолчанию .wasm грузится с CDN (это для браузера) — в Node отдаём файл из node_modules.
// Лениво: модулям, которым нужна только контрольная цифра, wasm не нужен.
let isWasmLoaded = false;
function loadWasm(): void {
  if (isWasmLoaded) return;
  const wasm = readFileSync(new URL(import.meta.resolve('zxing-wasm/reader/zxing_reader.wasm')));
  prepareZXingModule({
    // Buffer может быть «окном» в общий ArrayBuffer — вырезаем ровно свои байты.
    overrides: { wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) },
  });
  isWasmLoaded = true;
}

export async function readBarcode(bytes: Uint8Array): Promise<string | null> {
  loadWasm();
  let code: string | undefined;
  try {
    const found = await readBarcodes(bytes, {
      formats: ['EAN-13', 'EAN-8', 'UPC-A'],
      maxNumberOfSymbols: 1,
      tryHarder: true, // наклон, блики, сжатие Telegram
    });
    code = found.find((result) => result.isValid)?.text;
  } catch (err) {
    console.warn('Декодер штрихкодов не смог прочитать картинку:', err);
    return null;
  }
  return code ? normalizeBarcode(code) : null;
}

/** Вид, как в Open Food Facts: только цифры, UPC-A дополнен нулём до EAN-13. Невалидный → null. */
export function normalizeBarcode(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (!isValidEan(digits)) return null;
  return digits.length === 12 ? `0${digits}` : digits;
}

export function isValidEan(digits: string): boolean {
  if (!/^(\d{8}|\d{12}|\d{13})$/.test(digits)) return false;
  // Справа налево от предпоследней цифры: веса 3, 1, 3, 1…
  let sum = 0;
  for (let i = digits.length - 2, weight = 3; i >= 0; i--, weight = 4 - weight) {
    sum += Number(digits[i]) * weight;
  }
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}
