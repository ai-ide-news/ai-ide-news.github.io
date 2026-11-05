// Announced usage-limit resets for Codex and Claude Code. Neither vendor publishes a feed, so these come
// from two public trackers that follow the announcements on X. Both ask for credit where the data is
// shown, which the /resets/ page gives: codex-resets.com ("free to use, please link back") and
// claude-resets.com (CC BY 4.0). Only resets count here: limit-policy changes flush nothing.

export const RESET_SOURCES = {
  codex: { name: 'Codex', toolId: 'codex', api: 'https://codex-resets.com/api/resets', site: 'https://codex-resets.com/', siteName: 'Codex Resets', normalize: normalizeCodex },
  'claude-code': { name: 'Claude Code', toolId: 'claude-code', api: 'https://claude-resets.com/api/resets', site: 'https://claude-resets.com/', siteName: 'claude-resets.com', license: { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' }, normalize: normalizeClaude },
};

const TEXT_CAP = 280;
const DAY = 86400e3;

function cleanText(text) {
  const clean = String(text || '').replace(/https:\/\/t\.co\/\S+/g, '').replace(/\s+/g, ' ').trim();
  return clean.length > TEXT_CAP ? `${clean.slice(0, TEXT_CAP - 1).trimEnd()}…` : clean;
}
const httpsUrl = (url) => (/^https:\/\/[^\s"'<>]+$/.test(url || '') ? url : null);
const isoDate = (date) => { const t = Date.parse(date); return Number.isNaN(t) ? null : new Date(t).toISOString(); };
const newestFirst = (events) => events.filter((e) => e.id && e.date).sort((a, b) => b.date.localeCompare(a.date));

export function normalizeCodex(json) {
  return newestFirst((json?.events || []).map((e) => ({
    id: String(e.tweet_id || ''),
    date: isoDate(e.announced_at),
    banked: e.reset_type === 'banked',
    text: cleanText(e.display_text || e.text),
    url: httpsUrl(e.tweet_url),
  })));
}

// Provisional rows were auto-detected and not reviewed yet, so they wait until the tracker confirms them.
export function normalizeClaude(json) {
  return newestFirst((json?.providers?.claude?.events || [])
    .filter((e) => e.kind === 'reset' && e.verification !== 'provisional')
    .map((e) => ({
      id: String(e.id || ''),
      date: isoDate(e.date),
      banked: e.resetType === 'banked',
      text: cleanText(e.note),
      url: httpsUrl(e.url),
      ...(e.scope ? { scope: String(e.scope) } : {}),
      ...(isoDate(e.usableUntil) ? { usableUntil: isoDate(e.usableUntil) } : {}),
    })));
}

// Each source fails on its own and keeps its previous events, so one tracker going down can't blank the page.
export async function fetchResets(get, prev = {}, now = Date.now(), report = []) {
  const out = { fetchedAt: prev.fetchedAt || null };
  await Promise.all(Object.entries(RESET_SOURCES).map(async ([key, src]) => {
    out[key] = prev[key] || [];
    try {
      const events = src.normalize(await get(src.api, { json: true }));
      if (!events.length) throw new Error('no resets in the response');
      out[key] = events;
      out.fetchedAt = new Date(now).toISOString();
      report.push(`✓ ${`${src.name} resets`.padEnd(22)} ${String(events.length).padStart(3)} tracked`);
    } catch (e) { report.push(`⚠ ${src.name} resets: ${e.message} (kept previous)`); }
  }));
  return out;
}

/** events: newest first. Gaps are in days between consecutive announcements. */
export function resetStats(events, now = Date.now()) {
  const times = events.map((e) => Date.parse(e.date));
  const gaps = times.slice(1).map((t, i) => (times[i] - t) / DAY);
  return {
    count: events.length,
    banked: events.filter((e) => e.banked).length,
    meanGap: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null,
    longestGap: gaps.length ? Math.max(...gaps) : null,
    last30: times.filter((t) => now - t < 30 * DAY).length,
    last: events[0] || null,
    lastRegular: events.find((e) => !e.banked) || null,
  };
}
