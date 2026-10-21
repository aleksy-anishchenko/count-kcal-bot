import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareZXingModule, writeBarcode } from 'zxing-wasm/writer';
import { isValidEan, normalizeBarcode, readBarcode } from './barcode.ts';

test('isValidEan: контрольная цифра EAN-13, EAN-8, UPC-A', () => {
  assert.equal(isValidEan('4810268031793'), true);  // йогурт Teos
  assert.equal(isValidEan('3017620422003'), true);  // Nutella
  assert.equal(isValidEan('96385074'), true);       // EAN-8, пример из спецификации
  assert.equal(isValidEan('036000291452'), true);   // UPC-A, пример из спецификации
  assert.equal(isValidEan('4810268031794'), false); // одна цифра не та
  assert.equal(isValidEan('48102680317'), false);   // 11 цифр — такого формата нет
  assert.equal(isValidEan('abc'), false);
  assert.equal(isValidEan(''), false);
});

test('normalizeBarcode: убирает пробелы, UPC-A дополняет нулём, невалидный → null', () => {
  assert.equal(normalizeBarcode('4 810268 031793'), '4810268031793');
  assert.equal(normalizeBarcode('036000291452'), '0036000291452');
  assert.equal(normalizeBarcode('4810268031794'), null);
  assert.equal(normalizeBarcode(''), null);
});

test('readBarcode: читает EAN-13 с картинки (генерируем её тут же)', async () => {
  // Writer — отдельный модуль со своим wasm, грузим так же, как reader в barcode.ts.
  const wasm = readFileSync(new URL(import.meta.resolve('zxing-wasm/writer/zxing_writer.wasm')));
  prepareZXingModule({
    overrides: { wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) },
  });
  const { image } = await writeBarcode('4810268031793', { format: 'EAN-13' });
  assert.ok(image, 'writer должен вернуть PNG');
  const bytes = new Uint8Array(await image.arrayBuffer());
  assert.equal(await readBarcode(bytes), '4810268031793');
});

test('readBarcode: картинка без штрихкода → null', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  assert.equal(await readBarcode(new Uint8Array(png)), null);
});

test('readBarcode: битый файл → null, а не ошибка', async () => {
  assert.equal(await readBarcode(new Uint8Array([1, 2, 3])), null);
});
