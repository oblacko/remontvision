import test from 'node:test';
import assert from 'node:assert/strict';

const {
  ARCHITECT_PROMPT_KINDS,
  DEFAULT_ARCHITECT_PROMPTS,
  pickActiveArchitectPrompt,
  nextArchitectPromptVersion,
  getArchitectPrompt,
  setArchitectPromptsForTests,
} = await import('../src/architectprompts.js');

test('architect prompt kinds have non-empty defaults', () => {
  assert.deepEqual(ARCHITECT_PROMPT_KINDS, ['designer', 'builder', 'reviewer', 'criteria', 'direction', 'layout', 'breakdown', 'roadmap']);
  for (const kind of ARCHITECT_PROMPT_KINDS) {
    assert.ok(DEFAULT_ARCHITECT_PROMPTS[kind].length > 100);
    assert.match(DEFAULT_ARCHITECT_PROMPTS[kind], /JSON|Критерий|интерьер/i);
  }
});

test('picks the active version, otherwise the highest version', () => {
  const rows = [
    { id: 1, version: 1, active: false },
    { id: 2, version: 2, active: true },
    { id: 3, version: 3, active: false },
  ];
  assert.equal(pickActiveArchitectPrompt(rows).id, 2);
  assert.equal(pickActiveArchitectPrompt([{ id: 1, version: 4, active: false }]).id, 1);
  assert.equal(pickActiveArchitectPrompt([]), null);
  assert.equal(nextArchitectPromptVersion(rows), 4);
});

test('getArchitectPrompt falls back to defaults and can be overridden', () => {
  setArchitectPromptsForTests({ builder: { id: 9, version: 2, system: 'custom builder' } });
  assert.equal(getArchitectPrompt('builder').system, 'custom builder');
  assert.equal(getArchitectPrompt('reviewer').system, DEFAULT_ARCHITECT_PROMPTS.reviewer);
});
