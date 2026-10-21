// New AI models from the major labs, read from OpenRouter's public model catalog
// (https://openrouter.ai/api/v1/models — no key needed). Each entry carries its real listing
// date, context window and per-token API price, so the Models page is real data like the rest.

const API = 'https://openrouter.ai/api/v1/models';

// OpenRouter author prefix → lab shown on the site, with its lobehub logo (scripts/icons.mjs). Anything not listed (fine-tunes, routers,
// small studios) is left out so the page stays about the models people actually code with.
export const MODEL_LABS = {
  anthropic: { name: 'Anthropic', color: '#d97757', logo: 'lobe:anthropic' },
  openai: { name: 'OpenAI', color: '#10a37f', logo: 'lobe:openai' },
  google: { name: 'Google', color: '#4285f4', logo: 'lobe:gemini' },
  'x-ai': { name: 'xAI', color: '#9ca3af', logo: 'lobe:xai' },
  deepseek: { name: 'DeepSeek', color: '#4d6bfe', logo: 'lobe:deepseek' },
  qwen: { name: 'Qwen', color: '#615ced', logo: 'lobe:qwen' },
  moonshotai: { name: 'Moonshot AI', color: '#7aa2ff', logo: 'lobe:kimi' },
  'z-ai': { name: 'Z.ai', color: '#3b82f6', logo: 'lobe:zai' },
  mistralai: { name: 'Mistral', color: '#fa520f', logo: 'lobe:mistral' },
  meta: { name: 'Meta', color: '#0866ff', logo: 'lobe:meta' },
  'meta-llama': { name: 'Meta', color: '#0866ff', logo: 'lobe:meta' },
  minimax: { name: 'MiniMax', color: '#e2457a', logo: 'lobe:minimax' },
  nvidia: { name: 'NVIDIA', color: '#76b900', logo: 'lobe:nvidia' },
  amazon: { name: 'Amazon', color: '#ff9900', logo: 'lobe:nova' },
  microsoft: { name: 'Microsoft', color: '#00a4ef', logo: 'lobe:microsoft' },
  cohere: { name: 'Cohere', color: '#39594d', logo: 'lobe:cohere' },
  xiaomi: { name: 'Xiaomi', color: '#ff6900', logo: 'lobe:xiaomimimo' },
  'bytedance-seed': { name: 'ByteDance', color: '#3c8cff', logo: 'lobe:bytedance' },
  tencent: { name: 'Tencent', color: '#1d6cf5', logo: 'lobe:hunyuan' },
  stepfun: { name: 'StepFun', color: '#0ea5e9', logo: 'lobe:stepfun' },
};

export const labKey = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

// One icon entry per lab, shaped like a tool so scripts/icons.mjs can resolve and cache its logo.
export const LAB_ICONS = Object.values(Object.fromEntries(Object.values(MODEL_LABS)
  .map((l) => [l.name, { id: `lab-${labKey(l.name)}`, name: l.name, color: l.color, logo: l.logo }])));

// OpenRouter prices are USD per token as strings; the site shows USD per million tokens.
const perM = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1e6 * 1000) / 1000 : null;
};

const clip = (s, n = 240) => (s.length > n ? `${s.slice(0, s.lastIndexOf(' ', n) > 0 ? s.lastIndexOf(' ', n) : n).replace(/[.,;:\s]+$/, '')}…` : s);

export async function fetchModels(get) {
  const { data } = await get(API, { json: true });
  const freeIds = new Set(data.filter((m) => m.id.endsWith(':free')).map((m) => m.id.replace(/:free$/, '')));
  const baseIds = new Set(data.map((m) => m.id));
  const out = [];
  for (const listing of data) {
    // A model listed only as ":free" (no paid listing) stands in for its own base id.
    const freeOnly = listing.id.endsWith(':free') && !baseIds.has(listing.id.replace(/:free$/, ''));
    const m = freeOnly ? { ...listing, id: listing.id.replace(/:free$/, ''), name: listing.name?.replace(/\s*\(free\)$/i, '') } : listing;
    const [author] = m.id.split('/');
    const lab = MODEL_LABS[author];
    // Skip variants (:free, :batch, :thinking…) and "~latest" aliases; the base model represents them.
    if (!lab || m.id.includes(':') || !m.created) continue;
    const date = new Date(m.created * 1000);
    const input = perM(m.pricing?.prompt), output = perM(m.pricing?.completion);
    if (input == null || output == null) continue;
    out.push({
      id: m.id,
      name: (m.name || m.id).replace(/^[^:]+:\s*/, ''),
      lab: lab.name, labId: labKey(lab.name), color: lab.color,
      date: date.toISOString(),
      context: m.context_length || m.top_provider?.context_length || null,
      maxOutput: m.top_provider?.max_completion_tokens || null,
      input, output,
      free: freeIds.has(m.id) || (input === 0 && output === 0),
      freeVariant: freeIds.has(m.id),
      modalities: m.architecture?.input_modalities || [],
      reasoning: (m.supported_parameters || []).includes('reasoning'),
      tools: (m.supported_parameters || []).includes('tools'),
      openWeights: !!m.hugging_face_id,
      summary: clip((m.description || '').replace(/\s+/g, ' ').trim()),
      url: `https://openrouter.ai/${m.id}`,
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
}

// Every provider serving each model, from OpenRouter's per-model endpoints list
// (https://openrouter.ai/api/v1/models/<id>/endpoints — no key needed), so the site can show who is cheapest.
// Free endpoints (often free only for a limited time) live under the separate "<id>:free" listing, fetched alongside.
// One request per model, a few at a time; a model whose requests all fail keeps the providers it had before.
const pct = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);

export async function fetchProviders(get, models, prev = {}, concurrency = 8) {
  const out = {};
  let failed = 0;
  const queue = [...models];
  await Promise.all(Array.from({ length: concurrency }, async () => {
    for (let m; (m = queue.shift());) {
      try {
        const ids = [m.id, ...(m.freeVariant ? [`${m.id}:free`] : [])];
        const res = await Promise.allSettled(ids.map((id) => get(`${API}/${id}/endpoints`, { json: true })));
        if (res.every((r) => r.status === 'rejected')) throw res[0].reason;
        const endpoints = res.flatMap((r, i) => (r.status === 'fulfilled' ? (r.value.data?.endpoints || []).map((e) => ({ ...e, free: i > 0 })) : []));
        const seen = new Set();
        out[m.id] = endpoints.flatMap((e) => {
          const input = perM(e.pricing?.prompt), output = perM(e.pricing?.completion);
          const key = `${e.tag}${e.free ? ':free' : ''}`;
          if (input == null || output == null || seen.has(key)) return [];
          seen.add(key);
          const [, ...region] = (e.tag || '').split('/').filter((s) => !/^(fp|bf|int)\d+$|^flex$|^turbo$/.test(s));
          return [{
            name: e.provider_name,
            region: region.join('/') || null,
            input, output,
            cacheRead: perM(e.pricing?.input_cache_read),
            context: e.context_length || null,
            maxOutput: e.max_completion_tokens || null,
            quant: e.quantization && e.quantization !== 'unknown' ? e.quantization : null,
            uptime: pct(e.uptime_last_1d),
            latency: Number.isFinite(e.latency_last_30m) ? Math.round(e.latency_last_30m) : null,
            speed: Number.isFinite(e.throughput_last_30m) ? Math.round(e.throughput_last_30m) : null,
            tools: (e.supported_parameters || []).includes('tools'),
            ...(e.free || (input === 0 && output === 0) ? { free: true } : {}),
          }];
        }).sort((a, b) => a.input * 3 + a.output - (b.input * 3 + b.output) || (b.uptime ?? 0) - (a.uptime ?? 0));
      } catch {
        failed++;
        if (prev[m.id]) out[m.id] = prev[m.id];
      }
    }
  }));
  return { providers: out, failed };
}

// Providers beyond OpenRouter — OpenCode Zen/Go, Kilo, Vercel, Groq, the labs' own APIs, coding plans… — from
// models.dev (https://models.dev/api.json — no key needed), the open catalog OpenCode reads. A model matches on its
// id with the vendor prefix, ":free"/"-free" suffix and . / _ vs - differences ignored ("claude-opus-5.5" = "claude-opus-5-5").
const MODELS_DEV = 'https://models.dev/api.json';
// $0 on a subscription plan means "included in the plan", not free.
const PLAN = /coding.?plan|token.?plan|for coding|devpack|\bgo$|gitlab duo/i;
// Runtimes that run models on your own machine, not hosted providers.
const LOCAL = new Set(['lmstudio', 'ollama', 'qvac', 'atomic-chat', 'llama.cpp']);
// OpenRouter is read directly (fetchProviders) with far more detail per endpoint.
const SKIP = new Set(['openrouter', ...LOCAL]);

const modelKey = (id) => id.toLowerCase().split('/').pop().replace(/[:-]free$/, '').replace(/[._\s]+/g, '-');
const nameKey = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export async function fetchModelsDev(get, models) {
  const catalog = await get(MODELS_DEV, { json: true });
  const want = new Map(models.map((m) => [modelKey(m.id), m.id]));
  const out = {};
  for (const p of Object.values(catalog)) {
    if (SKIP.has(p.id)) continue;
    const plan = PLAN.test(`${p.id} ${p.name}`);
    for (const [key, x] of Object.entries(p.models || {})) {
      const id = want.get(modelKey(x.canonical_model_id || '')) || want.get(modelKey(key));
      const input = x.cost?.input, output = x.cost?.output;
      if (!id || !Number.isFinite(input) || !Number.isFinite(output)) continue;
      const zero = input === 0 && output === 0;
      (out[id] ||= []).push({
        name: p.name,
        region: null,
        input: Math.round(input * 1000) / 1000, output: Math.round(output * 1000) / 1000,
        cacheRead: Number.isFinite(x.cost?.cache_read) ? Math.round(x.cost.cache_read * 1000) / 1000 : null,
        context: x.limit?.context || null,
        maxOutput: x.limit?.output || null,
        quant: null, uptime: null, latency: null, speed: null,
        tools: x.tool_call !== false,
        ...(plan ? { plan: true } : zero ? { free: true } : {}),
        url: p.doc || null,
        via: 'models.dev',
      });
    }
  }
  return out;
}

// Adds models.dev providers to each model's OpenRouter list, skipping any provider OpenRouter already lists
// (same name and same free / paid kind). Paid providers are sorted cheapest first; free and plan rows lead.
export function mergeProviders(list = [], extra = []) {
  const kind = (p) => (p.plan ? 'plan' : p.free ? 'free' : 'paid');
  const seen = new Set(list.map((p) => `${nameKey(p.name)}|${kind(p)}`));
  const add = extra.filter((p) => {
    const k = `${nameKey(p.name)}|${kind(p)}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
  const rank = { free: 0, plan: 1, paid: 2 };
  return [...list, ...add].sort((a, b) => rank[kind(a)] - rank[kind(b)] || a.input * 3 + a.output - (b.input * 3 + b.output) || (b.uptime ?? 0) - (a.uptime ?? 0));
}
