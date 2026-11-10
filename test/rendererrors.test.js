import test from 'node:test';
import assert from 'node:assert/strict';
import { friendlyRenderError } from '../src/rendererrors.js';

test('maps 422 dimensions to friendly Russian', () => {
  const raw = 'https://openrouter.ai/api/v1/images 422: {"error":{"message":"Black Forest Labs submit returned 422: Images[1] dimensions must be at least 256x256 pixels"}}';
  assert.match(friendlyRenderError(raw), /слишком маленькое/);
});

test('maps 429 to overload message', () => {
  assert.match(friendlyRenderError('https://openrouter.ai/api/v1/images 429: {}'), /перегружен/);
});

test('maps moderation to moderation message', () => {
  assert.match(friendlyRenderError('openrouter 422: {"error":"content_policy violation"}'), /модераци/);
});

test('unknown errors get generic message, no raw json leaked', () => {
  const out = friendlyRenderError('images 500: {"secret":"x"}');
  assert.match(out, /Не удалось создать дизайн/);
  assert.ok(!out.includes('secret') && !out.includes('openrouter.ai'));
});
