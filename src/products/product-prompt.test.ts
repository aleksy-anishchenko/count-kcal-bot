import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEstimatePrompt, buildPortionPrompt } from './product-prompt.ts';
import { productWithoutNutrition, yogurt } from './test-fixtures.ts';

test('buildPortionPrompt: числа из базы и подпись пользователя', () => {
  const prompt = buildPortionPrompt(yogurt, 'съел половину');
  assert.match(prompt, /66\.8 ккал/);
  assert.match(prompt, /250 г/);
  assert.match(prompt, /«съел половину»/);
});

test('buildEstimatePrompt: название, вес, состав и просьба оценить на 100 г', () => {
  const prompt = buildEstimatePrompt(productWithoutNutrition);
  assert.match(prompt, /Талицкий/);
  assert.match(prompt, /125 г/);
  assert.match(prompt, /Состав: Молоко, закваска/);
  assert.match(prompt, /на 100 г/);
  assert.match(prompt, /amount — «100 г»/);
});
