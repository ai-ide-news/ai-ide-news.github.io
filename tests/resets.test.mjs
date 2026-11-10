import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCodex, normalizeClaude, normalizeAntigravity, normalizeGlm, resetsChanged, fetchResets, resetStats, RESET_SOURCES } from '../scripts/resets.mjs';

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

test('Antigravity keeps model and plan scope and sanitizes announcements', () => {
  const events = normalizeAntigravity({ data: [
    { id: 'reset', announced_at: '2026-11-06T23:57:39Z', text: 'Reset https://t.co/abc', plans: ['paid'], models: ['gemini', 'argon'], source: { url: 'javascript:bad' } },
    { id: 'bad', announced_at: 'invalid' },
  ] });
  assert.equal(events.length, 1);
  assert.equal(events[0].scope, 'Paid plans · gemini · argon');
  assert.equal(events[0].banked, false);
  assert.equal(events[0].text, 'Reset');
  assert.equal(events[0].url, null);
});

test('GLM counts confirmed completed resets and grants, excluding policies and reports', () => {
  const base = { provider: 'zai', product: 'glm-coding-plan', confidence: 'confirmed', lifecycle: 'completed', type: 'global_reset', announced_at: '2026-08-11T04:17:00Z', effective_at: '2026-08-11T04:58:00Z', sources: [
    { kind: 'staff_post', claim: 'announces', url: 'https://x.com/announcement' },
    { kind: 'official', claim: 'confirms_completion', url: 'https://x.com/confirmed' },
  ] };
  const events = normalizeGlm({ events: [
    { ...base, id: 'reset' },
    { ...base, id: 'grant', type: 'banked_grant', expires_at: '2026-10-01T00:00:00Z' },
    { ...base, id: 'reported', confidence: 'reported' },
    { ...base, id: 'policy', type: 'policy_change' },
    { ...base, id: 'future', lifecycle: 'announced' },
    { ...base, id: 'other', product: 'other' },
    { ...base, id: 'month', time_precision: 'month' },
  ] });
  assert.deepEqual(events.map((e) => e.id), ['reset', 'grant']);
  assert.equal(events[0].date, base.effective_at.replace('Z', '.000Z'));
  assert.equal(events[0].url, 'https://x.com/confirmed');
  assert.equal(events[1].banked, true);
  assert.equal(events[1].usableUntil, '2026-10-01T00:00:00.000Z');
});

test('new providers and corrections trigger refresh, timestamps alone do not', () => {
  assert.equal(resetsChanged({ antigravity: [{ id: 'new' }] }, {}), true);
  assert.equal(resetsChanged({ glm: [{ id: 'same', banked: true }] }, { glm: [{ id: 'same', banked: false }] }), true);
  assert.equal(resetsChanged({ fetchedAt: 'new' }, { fetchedAt: 'old' }), false);
});

test('Antigravity fetch follows cursors and keeps previous data on pagination failure', async () => {
  const calls = [];
  const get = async (url) => {
    calls.push(url);
    if (!url.startsWith(RESET_SOURCES.antigravity.api)) throw new Error('offline');
    return { data: [{ id: url.includes('cursor=') ? 'older' : 'newer', announced_at: '2026-11-06T00:00:00Z' }], pagination: { next_cursor: url.includes('cursor=') ? null : 'page 2' } };
  };
  const result = await fetchResets(get);
  assert.equal(result.antigravity.length, 2);
  assert.ok(calls.some((url) => url.endsWith('&cursor=page%202')));
  const prev = { antigravity: [{ id: 'saved' }], glm: [{ id: 'glm-saved' }] };
  const failed = await fetchResets(async () => { throw new Error('offline'); }, prev);
  assert.deepEqual(failed.antigravity, prev.antigravity);
  assert.deepEqual(failed.glm, prev.glm);
});
