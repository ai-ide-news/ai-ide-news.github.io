import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCodex, normalizeClaude, fetchResets, resetStats, RESET_SOURCES } from '../scripts/resets.mjs';

const codex = { events: [
  { tweet_id: '1', tweet_url: 'https://x.com/thsottiaux/status/1', text: 'older', announced_at: '2026-10-01T00:00:00.000Z', reset_type: 'regular' },
  { tweet_id: '2', tweet_url: 'javascript:alert(1)', text: 'x', display_text: 'Done. https://t.co/abc\n\nEnjoy', announced_at: '2026-10-11T00:00:00.000Z', reset_type: 'banked' },
  { tweet_id: '3', text: 'bad date', announced_at: 'soon', reset_type: 'regular' },
] };
const claude = { providers: { claude: { events: [
  { id: 'a', date: '2026-09-01T00:00:00Z', kind: 'reset', scope: 'all', note: 'Reset', url: 'https://x.com/ClaudeDevs/status/a', verification: 'curated' },
  { id: 'b', date: '2026-09-02T00:00:00Z', kind: 'policy', note: 'Raised limits', verification: 'curated' },
  { id: 'c', date: '2026-09-03T00:00:00Z', kind: 'reset', note: 'Maybe', verification: 'provisional' },
  { id: 'd', date: '2026-09-04T00:00:00Z', kind: 'reset', resetType: 'banked', usableUntil: '2026-10-04T23:59:59Z', note: 'Banked', verification: 'curated' },
] } } };

test('Codex events are sorted, cleaned, and drop bad dates and unsafe links', () => {
  const events = normalizeCodex(codex);
  assert.deepEqual(events.map((e) => e.id), ['2', '1']);
  assert.equal(events[0].text, 'Done. Enjoy');
  assert.equal(events[0].banked, true);
  assert.equal(events[0].url, null);
});

test('Claude events keep confirmed resets only', () => {
  const events = normalizeClaude(claude);
  assert.deepEqual(events.map((e) => e.id), ['d', 'a']);
  assert.equal(events[0].usableUntil, '2026-10-04T23:59:59.000Z');
  assert.equal(events[1].scope, 'all');
});

test('stats report gaps and tell banked resets from regular ones', () => {
  const stats = resetStats(normalizeCodex(codex), Date.parse('2026-10-20T00:00:00Z'));
  assert.equal(stats.meanGap, 10);
  assert.equal(stats.longestGap, 10);
  assert.equal(stats.last30, 2);
  assert.equal(stats.last.id, '2');
  assert.equal(stats.lastRegular.id, '1');
});

test('one failed or empty source keeps its previous events', async () => {
  const prev = { fetchedAt: 'then', 'claude-code': [{ id: 'old' }] };
  const report = [];
  const out = await fetchResets(async (url) => (url === RESET_SOURCES.codex.api ? codex : { providers: {} }), prev, Date.parse('2026-11-05T00:00:00Z'), report);
  assert.equal(out.codex.length, 2);
  assert.deepEqual(out['claude-code'], [{ id: 'old' }]);
  assert.equal(out.fetchedAt, '2026-11-05T00:00:00.000Z');
  assert.ok(report.some((line) => line.startsWith('⚠ Claude Code resets')));
});
