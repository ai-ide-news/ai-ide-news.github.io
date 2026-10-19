// New AI models from the major labs, read from OpenRouter's public model catalog
// (https://openrouter.ai/api/v1/models — no key needed). Each entry carries its real listing
// date, context window and per-token API price, so the Models page is real data like the rest.

const API = 'https://openrouter.ai/api/v1/models';
const MAX_AGE_DAYS = 540;

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

export async function fetchModels(get, now) {
  const { data } = await get(API, { json: true });
  const freeIds = new Set(data.filter((m) => m.id.endsWith(':free')).map((m) => m.id.replace(/:free$/, '')));
  const out = [];
  for (const m of data) {
    const [author] = m.id.split('/');
    const lab = MODEL_LABS[author];
    // Skip variants (:free, :batch, :thinking…) and "~latest" aliases; the base model represents them.
    if (!lab || m.id.includes(':') || !m.created) continue;
    const date = new Date(m.created * 1000);
    if (now - +date > MAX_AGE_DAYS * 86400e3) continue;
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
