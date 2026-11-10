// Public reset announcements from credited community trackers. Account-specific rolling windows
// and off-peak reset cards are explained on the page, never synthesized as public reset events.

export const RESET_SOURCES = {
  codex: { name: 'Codex', toolId: 'codex', api: 'https://codex-resets.com/api/resets', site: 'https://codex-resets.com/', siteName: 'Codex Resets', normalize: normalizeCodex },
  'claude-code': { name: 'Claude Code', toolId: 'claude-code', api: 'https://claude-resets.com/api/resets', site: 'https://claude-resets.com/', siteName: 'claude-resets.com', license: { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' }, normalize: normalizeClaude },
  antigravity: { name: 'Antigravity', toolId: 'antigravity', api: 'https://www.agyresets.com/api/v1/resets?limit=100', site: 'https://www.agyresets.com/', siteName: 'AGY Resets', normalize: normalizeAntigravity, paginated: true },
  glm: { name: 'GLM Coding Plan', api: 'https://www.resets.io/api/v1/events.json', site: 'https://www.resets.io/labs/zai/', siteName: 'resets.io', normalize: normalizeGlm },
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

export function normalizeAntigravity(json) {
  return newestFirst((json?.data || []).map((e) => ({
    id: String(e.id || ''), date: isoDate(e.announced_at), banked: false,
    text: cleanText(e.text), url: httpsUrl(e.source?.url),
    scope: [...(e.plans || []).filter((p) => p !== 'unspecified').map((p) => p === 'all' ? 'All plans' : p === 'paid' ? 'Paid plans' : p),
      ...(e.models || []).filter((m) => !['all', 'unspecified'].includes(m))].join(' · '),
  })));
}

export function normalizeGlm(json) {
  return newestFirst((json?.events || [])
    .filter((e) => e.provider === 'zai' && e.product === 'glm-coding-plan'
      && e.confidence === 'confirmed' && ['completed', 'active', 'expired'].includes(e.lifecycle)
      && ['global_reset', 'banked_grant'].includes(e.type) && e.time_precision !== 'month')
    .map((e) => ({
      id: String(e.id || ''), date: isoDate(e.effective_at || e.announced_at),
      banked: e.type === 'banked_grant', text: cleanText(e.summary),
      url: httpsUrl(e.sources?.find((s) => ['official', 'staff_post'].includes(s.kind) && s.claim === 'confirms_completion')?.url
        || e.sources?.find((s) => ['official', 'staff_post'].includes(s.kind))?.url),
      ...(e.scope?.note ? { scope: cleanText(e.scope.note) } : {}),
      ...(isoDate(e.expires_at) ? { usableUntil: isoDate(e.expires_at) } : {}),
    })));
}

// Include corrections to existing entries as well as additions, for every configured provider.
export function resetsChanged(next, prev) {
  return Object.keys(RESET_SOURCES).some((key) => JSON.stringify(next?.[key] || []) !== JSON.stringify(prev?.[key] || []));
}

// Each source fails on its own and keeps its previous events, so one tracker going down can't blank the page.
export async function fetchResets(get, prev = {}, now = Date.now(), report = []) {
  const out = { fetchedAt: prev.fetchedAt || null };
  await Promise.all(Object.entries(RESET_SOURCES).map(async ([key, src]) => {
    out[key] = prev[key] || [];
    try {
      const json = await get(src.api, { json: true });
      if (src.paginated) {
        let cursor = json.pagination?.next_cursor;
        const seen = new Set();
        while (cursor) {
          if (seen.has(cursor) || seen.size >= 20) throw new Error('invalid reset pagination');
          seen.add(cursor);
          const page = await get(`${src.api}&cursor=${encodeURIComponent(cursor)}`, { json: true });
          json.data.push(...page.data);
          cursor = page.pagination?.next_cursor;
        }
      }
      const events = src.normalize(json);
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
