import test from 'node:test';
import assert from 'node:assert/strict';

process.env.OPENROUTER_API_KEY = 'test-key';
process.env.RENDER_MODEL = 'test/model';

const { buildCleanupPrompt, getCleanupConfig, setCleanupConfigForTests } = await import('../src/cleanupconfig.js');
const { supportsResolution } = await import('../src/modelcaps.js');

test('cleanup prompt keeps architecture and removes furniture for bedroom', () => {
  setCleanupConfigForTests({ prompt: 'Empty {room}. Keep {keep}. Remove {remove}.' });
  const p = buildCleanupPrompt('Спальня');
  assert.match(p, /^Empty bedroom\./);
  assert.match(p, /window opening/);
  assert.match(p, /bed/);
  assert.match(p, /mirror/);
  assert.equal(getCleanupConfig().model, 'black-forest-labs/flux-3-image-klein');
});

test('cleanup prompt keeps built-ins for kitchen', () => {
  setCleanupConfigForTests({ prompt: '{room}|{keep}|{remove}' });
  const p = buildCleanupPrompt('Кухня');
  assert.match(p, /kitchen/);
  assert.match(p, /built-in kitchen cabinets/);
  assert.match(p, /plumbing/);
  assert.match(p, /freestanding furniture/);
});

test('custom cleanup prompt is passed through unchanged', () => {
  setCleanupConfigForTests({ prompt: 'Remove everything and make an empty room.' });
  assert.equal(buildCleanupPrompt('Санузел'), 'Remove everything and make an empty room.');
});

test('FLUX 3 Klein supports resolution, FLUX 2 Pro does not', () => {
  assert.equal(supportsResolution('black-forest-labs/flux-3-image-klein'), true);
  assert.equal(supportsResolution('black-forest-labs/flux.2-pro'), false);
  assert.equal(supportsResolution('bytedance-seed/seedream-5-0-flash'), true);
});
