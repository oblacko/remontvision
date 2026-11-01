import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_GRID_PROMPT,
  DEFAULT_SEARCH_PROMPTS,
  PROMPT_KINDS,
  createPromptVersion,
  getActivePrompt,
  nextPromptVersion,
  pickActivePrompt,
  setSearchPromptsForTests,
} from '../src/searchprompts.js';

test('nextPromptVersion bumps version', () => {
  assert.equal(nextPromptVersion([{ version: 1 }, { version: 3 }]), 4);
  assert.equal(nextPromptVersion([]), 1);
});

test('pickActivePrompt prefers active then latest', () => {
  const active = { id: 2, version: 2, active: true };
  assert.equal(
    pickActivePrompt([{ id: 3, version: 3, active: false }, active, { id: 1, version: 1, active: true }]),
    active,
  );
  assert.deepEqual(pickActivePrompt([{ id: 1, version: 1 }, { id: 5, version: 5 }]), { id: 5, version: 5 });
  assert.equal(pickActivePrompt([]), null);
});

test('getActivePrompt returns active version', () => {
  setSearchPromptsForTests({ vision: { id: 7, version: 2, prompt: 'X' } });
  assert.deepEqual(getActivePrompt('vision'), { id: 7, version: 2, prompt: 'X' });
});

test('has defaults for every prompt kind', () => {
  assert.deepEqual(PROMPT_KINDS, ['vision', 'grid', 'cell']);
  for (const kind of PROMPT_KINDS) {
    assert.equal(typeof DEFAULT_SEARCH_PROMPTS[kind], 'string');
    assert.ok(DEFAULT_SEARCH_PROMPTS[kind].length > 0);
  }
  assert.equal(DEFAULT_SEARCH_PROMPTS.grid, DEFAULT_GRID_PROMPT);
});

test('createPromptVersion rejects invalid kind and empty prompt', async () => {
  await assert.rejects(createPromptVersion('nope', 'x'), /Неизвестный/);
  await assert.rejects(createPromptVersion('grid', '   '), /пуст/i);
});
