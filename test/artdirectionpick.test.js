import test from 'node:test';
import assert from 'node:assert/strict';
import { pickArtDirection } from '../src/artdirectionpick.js';

test('direction text wins', () => {
  const picked = pickArtDirection({
    direction: { text: 'direction text' },
    ad: { text: 'art director text' },
  });
  assert.deepEqual(picked, { branch: 'direction', text: 'direction text' });
});

test('falls back to the art director when direction has no text', () => {
  const picked = pickArtDirection({
    direction: { text: '' },
    ad: { text: 'art director text' },
  });
  assert.deepEqual(picked, { branch: 'art_director', text: 'art director text' });
});

test('empty when neither has text', () => {
  assert.deepEqual(pickArtDirection({ direction: null, ad: null }), { branch: 'none', text: '' });
  assert.deepEqual(pickArtDirection({ direction: { text: '' }, ad: { text: '' } }), { branch: 'none', text: '' });
});
