import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasNutrition } from './product.ts';
import { productWithoutNutrition, yogurt } from './test-fixtures.ts';

test('hasNutrition', () => {
  assert.equal(hasNutrition(yogurt), true);
  assert.equal(hasNutrition(productWithoutNutrition), false);
});
