import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOL_TOPICS, topicPath, toolDescription } from '../scripts/seo.mjs';
import { CATEGORIES, TOOLS } from '../scripts/sources.mjs';

test('every workflow has a unique static URL and substantive guidance', () => {
  assert.deepEqual(Object.keys(TOOL_TOPICS).sort(), Object.keys(CATEGORIES).sort());
  const paths = Object.keys(TOOL_TOPICS).map(topicPath);
  assert.equal(new Set(paths).size, paths.length);
  for (const [category, topic] of Object.entries(TOOL_TOPICS)) {
    assert.match(topicPath(category), /^tools\/[a-z-]+\/$/);
    assert.ok(topic.description.length > 60 && topic.description.length <= 158);
    assert.ok(topic.guidance.length > 100);
    assert.ok(!TOOLS.some((tool) => tool.id === topic.slug), 'topic cannot overwrite a tool page');
  }
});

test('release snippets lead with the tool, version and date', () => {
  const text = toolDescription({ name: 'Claude Code', vendor: 'Anthropic' }, '2.1.317', 'Nov 3, 2026');
  assert.match(text, /^Claude Code 2\.1\.317: latest release \(Nov 3, 2026\)/);
  assert.match(text, /official release notes/);
  assert.ok(text.length <= 158);
});

test('tools without version data do not invent a release or date', () => {
  const text = toolDescription({ name: 'Example', vendor: 'Vendor' }, undefined, null);
  assert.match(text, /^Example: latest update\./);
  assert.doesNotMatch(text, /undefined|null|\(\)/);
});
