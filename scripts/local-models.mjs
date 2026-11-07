// What it takes to run each open-weight model at home: parameter counts, the attention shape that sets
// the KV-cache size, and where ready-made GGUF (llama.cpp / Ollama / LM Studio) and MLX (Apple) builds
// live. Read from Hugging Face's public API (no key needed) using the repo id OpenRouter lists for the
// model. Incremental: a model already measured is kept, so a normal refresh only looks up new models.
// Used by the "Run AI at home" page (scripts/local.mjs) and its calculator (src/local.js).

const HF = 'https://huggingface.co';
const num = (v) => (Number.isFinite(+v) && +v > 0 ? +v : null);

// Sizes written in names or descriptions, e.g. "Qwen3.6 35B A3B", "30B-A3B", "120b-a12b", "1.8B".
export function sizeFromText(name, summary = '') {
  const n = name.match(/(\d+(?:\.\d+)?)\s*([BT])[ -]A(\d+(?:\.\d+)?)B\b/i);
  if (n) return { total: +n[1] * (/t/i.test(n[2]) ? 1000 : 1), active: +n[3] };
  const e = name.match(/(\d+(?:\.\d+)?)B-\d+E(?![a-z])/i);
  if (e) return { total: null, active: +e[1] };
  const mx = name.match(/(\d+)x(\d+(?:\.\d+)?)B/i);
  if (mx) return { total: null, active: null };
  const s = summary.match(/(\d+(?:\.\d+)?)\s*B\s+(?:active|activated)[^\d]{0,40}?(\d+(?:\.\d+)?)\s*([BT])\s+total/i);
  if (s) return { active: +s[1], total: +s[2] * (/t/i.test(s[3]) ? 1000 : 1) };
  const s2 = summary.match(/(\d+(?:\.\d+)?)\s*([BT])\s+total parameters?[^\d]{0,30}?(\d+(?:\.\d+)?)\s*B\s+(?:active|activated)/i);
  if (s2) return { total: +s2[1] * (/t/i.test(s2[2]) ? 1000 : 1), active: +s2[3] };
  const d = name.match(/\b(\d+(?:\.\d+)?)\s*([BT])\b/i);
  if (d) return { total: +d[1] * (/t/i.test(d[2]) ? 1000 : 1), active: null };
  return { total: null, active: null };
}

// Bytes of KV cache per token of context at 16-bit precision, from a transformers config.json.
// Counts only layers that keep a full cache (hybrid models mix in linear or sliding-window layers),
// and uses the compressed latent size for DeepSeek-style multi-head latent attention (MLA).
export function kvBytesPerToken(cfg) {
  const c = cfg.text_config || cfg.language_config || cfg.llm_config || cfg;
  const layers = num(c.num_hidden_layers) || num(c.n_layers) || num(c.num_layers);
  if (!layers) return null;
  let full = layers;
  if (Array.isArray(c.layer_types)) full = c.layer_types.filter((t) => /full|global/.test(t)).length || layers;
  else if (num(c.full_attention_interval)) full = Math.ceil(layers / c.full_attention_interval);
  else if (num(c.sliding_window_pattern)) full = Math.ceil(layers / c.sliding_window_pattern);
  if (num(c.kv_lora_rank)) return full * (c.kv_lora_rank + (num(c.qk_rope_head_dim) || 64)) * 2;
  const heads = num(c.num_attention_heads) || num(c.n_heads);
  const kv = num(c.num_key_value_heads) || num(c.multi_query_group_num) || heads;
  const dim = num(c.head_dim) || (num(c.hidden_size) && heads ? c.hidden_size / heads : null);
  if (!kv || !dim) return null;
  return 2 * full * kv * dim * 2;
}

function arch(cfg) {
  const c = cfg.text_config || cfg.language_config || cfg.llm_config || cfg;
  return {
    layers: num(c.num_hidden_layers) || null,
    experts: num(c.num_experts) || num(c.n_routed_experts) || num(c.num_local_experts) || null,
    expertsPerToken: num(c.num_experts_per_tok) || num(c.moe_topk) || null,
    maxCtx: num(c.max_position_embeddings) || null,
  };
}

// The best-known community build of a repo in a given format, e.g. unsloth/…-GGUF. Only exact
// conversions count: the repo name, once format and bit-width tags are stripped, must match the
// original's. Fine-tunes, merges, distills and pruned variants are skipped.
// Uploaders that ship the full ladder of quantizations come first.
const TRUSTED = ['unsloth', 'bartowski', 'lmstudio-community', 'mlx-community', 'ggml-org', 'mradermacher', 'MaziyarPanahi'];
const norm = (s) => s.toLowerCase()
  .replace(/^[a-z0-9-]+_/, '') // bartowski-style "deepseek-ai_" prefixes
  .replace(/\b(gguf|mlx|i1|imatrix|qat|mxfp4(-q8)?|bf16|fp16|f16|fp8|dq\d\S*|q\d\S*|\d+-?bits?)\b/g, '')
  .replace(/[^a-z0-9]/g, '');
async function build(get, repo, filter) {
  const [author, base] = repo.split('/');
  const q = `${HF}/api/models?search=${encodeURIComponent(base)}&filter=${filter}&sort=downloads&direction=-1&limit=30`;
  const rows = await get(q, { json: true }).catch(() => []);
  const want = norm(base);
  const ok = (rows || []).filter((r) => norm(r.id.split('/')[1]) === want);
  const rank = (r) => { const a = r.id.split('/')[0]; return TRUSTED.includes(a) ? TRUSTED.indexOf(a) : a === author ? 50 : 99; };
  ok.sort((a, b) => rank(a) - rank(b));
  return ok[0]?.id || null;
}

// Quantizations a GGUF repo actually ships, from its file names (Q4_K_M, UD-Q2_K_XL, MXFP4_MOE…).
export function ggufQuants(files) {
  const q = new Set();
  for (const f of files) {
    if (!/\.gguf$/i.test(f) || /mmproj|imatrix/i.test(f)) continue;
    const m = f.split('/').pop().match(/(?:^|[-_.])((?:UD-)?(?:I?Q\d_[A-Z0-9_]*?|MXFP4(?:_MOE)?|BF16|F16|F32))(?:-\d{5}-of-\d{5})?\.gguf$/i);
    if (m) q.add(m[1].toUpperCase().replace(/_$/, ''));
  }
  return [...q];
}

// Active parameters of a mixture-of-experts model, from its config: total minus the experts a token skips.
function activeFromConfig(cfg, totalB) {
  const c = cfg.text_config || cfg.language_config || cfg.llm_config || cfg;
  const n = num(c.n_routed_experts) || num(c.num_experts) || num(c.num_local_experts);
  const k = num(c.num_experts_per_tok) || num(c.moe_topk);
  const h = num(c.hidden_size), inter = num(c.moe_intermediate_size) || num(c.intermediate_size);
  const layers = num(c.num_hidden_layers);
  if (!n || !k || !h || !inter || !layers || !totalB || k >= n) return null;
  const dense = num(c.first_k_dense_replace) || 0;
  const step = num(c.interleave_moe_layer_step) || num(c.decoder_sparse_step) || 1;
  const moeLayers = Math.floor((layers - dense) / step);
  const experts = 3 * h * inter * n * moeLayers / 1e9;
  const active = totalB - experts * (1 - k / n);
  return active > 0.3 && active < totalB * 0.2 ? Math.round(active * 10) / 10 : null;
}

export async function fetchLocal(rawGet, models, prev = {}, concurrency = 3) {
  // Hugging Face rate-limits anonymous bursts: pace requests and wait out a 429 once.
  const get = async (url, opt) => {
    await new Promise((r) => setTimeout(r, 150));
    try { return await rawGet(url, opt); } catch (e) {
      if (!/429/.test(e.message)) throw e;
      await new Promise((r) => setTimeout(r, 60000));
      return rawGet(url, opt);
    }
  };
  const out = {};
  const todo = [];
  for (const m of models) {
    if (!m.openWeights) continue;
    const old = prev[m.id];
    if (old && old.hf === (m.hf || old.hf) && old.checked) out[m.id] = old; else todo.push(m);
  }
  await Promise.all(Array.from({ length: concurrency }, async () => {
    for (let m; (m = todo.shift());) {
      const guess = sizeFromText(`${m.name} ${(m.hf || '').split('/')[1] || ''}`, m.summary);
      const row = { hf: m.hf || null, total: guess.total, active: guess.active, checked: new Date().toISOString().slice(0, 10) };
      if (m.hf) {
        const info = await get(`${HF}/api/models/${m.hf}?expand[]=safetensors&expand[]=gated`, { json: true }).catch(() => null);
        const t = info?.safetensors?.total;
        if (t) row.total = Math.round(t / 1e8) / 10;
        if (info?.gated) row.gated = true;
        const cfg = await get(`${HF}/${m.hf}/resolve/main/config.json`, { json: true }).catch(() => null);
        if (cfg) {
          row.kv = kvBytesPerToken(cfg);
          Object.assign(row, Object.fromEntries(Object.entries(arch(cfg)).filter(([, v]) => v)));
          if (!row.active) row.active = activeFromConfig(cfg, row.total);
        }
        row.gguf = await build(get, m.hf, 'gguf');
        if (row.gguf) {
          const info = await get(`${HF}/api/models/${row.gguf}`, { json: true }).catch(() => null);
          const q = ggufQuants((info?.siblings || []).map((f) => f.rfilename));
          if (q.length) row.quants = q;
        }
        row.mlx = await build(get, m.hf, 'mlx');
      }
      if (!row.active || (row.total && row.active >= row.total)) delete row.active;
      if (!row.kv) delete row.kv;
      for (const k of ['gguf', 'mlx']) if (!row[k]) delete row[k];
      out[m.id] = row;
    }
  }));
  return out;
}
