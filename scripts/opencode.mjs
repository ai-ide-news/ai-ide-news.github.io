// Real-world model usage across OpenCode, from OpenCode Data's public JSON (https://opencode.ai/data/ —
// no key needed, aggregated hourly): token leaderboard, daily tokens and users per model, weekly
// retention, session cost, token prices, cache ratio, market share by lab and usage by country.

const API = 'https://opencode.ai/data/index.json';
export const OPENCODE_SOURCE = { name: 'OpenCode Data', url: 'https://opencode.ai/data/' };

export async function fetchOpenCode(get) {
  const j = await get(API, { json: true });
  const need = ['leaderboard', 'dailyTokens', 'dailyUniqueUsers', 'marketShare'];
  const missing = need.filter((k) => !j?.[k]);
  if (missing.length || !j.leaderboard.pastWeek?.length) throw new Error(`unexpected shape (missing ${missing.join(', ') || 'leaderboard.pastWeek'})`);
  return {
    fetchedAt: new Date().toISOString(),
    updatedAt: j.updatedAt,
    summary: j.summary || '',
    leaderboard: { pastWeek: j.leaderboard.pastWeek, pastDay: j.leaderboard.pastDay || [] },
    dailyTokens: j.dailyTokens,
    dailyUniqueUsers: j.dailyUniqueUsers,
    weeklyRetention: j.weeklyRetention || [],
    sessionCost: j.sessionCost || [],
    tokenPrices: j.tokenPricesUsdPer1M || [],
    cacheRatio: j.cacheRatio || [],
    marketShare: j.marketShare,
    countries: (j.countries || []).slice(0, 30),
  };
}
