// Intelligence indexes, output speed and prices from Artificial Analysis' free data API
// (https://artificialanalysis.ai/documentation). Needs a free API key in AA_API_KEY; attribution required.
// Without a key the leaderboard falls back to indexes built from Epoch AI scores.

const API = 'https://artificialanalysis.ai/api/v2/data/llms/models';
export const AA_SOURCE = { name: 'Artificial Analysis', url: 'https://artificialanalysis.ai/' };

const num = (v) => (Number.isFinite(+v) && v !== null && v !== '' ? +v : null);

// → [{ slug, name, creator, intel, code, math, speed, ttft, price }], one per AA model with any metric.
export async function fetchAA(key) {
  const res = await fetch(API, { headers: { 'x-api-key': key }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${res.status} ${API}`);
  const { data = [] } = await res.json();
  return data.map((m) => ({
    slug: m.slug,
    name: m.name,
    creator: m.model_creator?.name || '',
    intel: num(m.evaluations?.artificial_analysis_intelligence_index),
    code: num(m.evaluations?.artificial_analysis_coding_index),
    math: num(m.evaluations?.artificial_analysis_math_index),
    speed: num(m.median_output_tokens_per_second) || null,
    ttft: num(m.median_time_to_first_token_seconds),
    price: num(m.pricing?.price_1m_blended_3_to_1),
  })).filter((m) => m.slug && (m.intel ?? m.code ?? m.speed) != null);
}
