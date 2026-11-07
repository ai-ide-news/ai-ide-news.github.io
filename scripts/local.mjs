// "Run AI at home" page: how local inference works, a calculator that reads your hardware and says
// which open-weight models will run (and how fast), what to tweak or upgrade, and the exact commands
// to set each one up. Model sizes come from Hugging Face (scripts/local-models.mjs → snapshot.local);
// the in-browser part lives in src/local.js and shares the formulas below (keep the two in step).

const fmt = (n) => n.toLocaleString('en-US');
const gb = (n) => (n >= 100 ? `${Math.round(n)} GB` : n >= 10 ? `${n.toFixed(0)} GB` : `${n.toFixed(1)} GB`);
const params = (b) => (b >= 1000 ? `${+(b / 1000).toFixed(2)}T` : `${+b.toFixed(b < 10 ? 1 : 0)}B`);

// Bits per weight of common GGUF quantizations (averages, including the scales stored with each block).
export const QUANTS = [['Q2_K', 2.9], ['Q3_K_M', 3.9], ['Q4_K_M', 4.85], ['Q5_K_M', 5.7], ['Q6_K', 6.6], ['Q8_0', 8.5], ['BF16', 16]];
// KV-cache bytes per token when the model's config couldn't be read (gated repos): a fit to Llama-style GQA models.
export const kvGuess = (totalB) => Math.round(131072 * (totalB / 8) ** 0.42);
export const weightsGB = (totalB, bpw) => totalB * bpw / 8;
export const kvGB = (kvBytes, ctx, factor = 1) => (kvBytes * ctx * factor) / 1e9;

export const LOCAL_SECTIONS = [
  ['how-local', 'How local AI works'], ['memory', 'Memory math'], ['speed-local', 'Why speed = bandwidth'],
  ['formats', 'GGUF, MLX & quant types'], ['setup', 'Set up in 10 minutes'], ['connect', 'Use it from your coding agent'], ['all', 'Every open model'],
];

export function localBody({ models, local, root, esc, modelPath, intel }) {
  const rows = models.filter((m) => m.openWeights && local[m.id]?.total).map((m) => {
    const l = local[m.id];
    return {
      id: m.id, n: m.name, lab: m.lab, c: m.color, d: m.date.slice(0, 10), p: modelPath(m),
      t: l.total, a: l.active || null, kv: l.kv || kvGuess(l.active || l.total), kvEst: !l.kv,
      ctx: Math.min(m.context || l.maxCtx || 32768, l.maxCtx || Infinity), hf: l.hf, g: l.gguf || null, q: l.quants || null, mlx: l.mlx || null,
      tools: !!m.tools, vis: (m.modalities || []).includes('image'), r: !!m.reasoning, i: intel(m) ?? null, gated: !!l.gated,
    };
  });
  const unsized = models.filter((m) => m.openWeights && !local[m.id]?.total);
  const q4 = QUANTS[2][1], q8 = QUANTS[5][1];
  const need = (r, bpw) => weightsGB(r.t, bpw) + kvGB(r.kv, 8192) + 0.8;
  const byLab = Object.entries(rows.reduce((a, r) => ((a[r.lab] = (a[r.lab] || 0) + 1), a), {})).sort((a, b) => b[1] - a[1]);
  const small = rows.filter((r) => need(r, q4) <= 7.5).length, mid = rows.filter((r) => need(r, q4) <= 23).length;
  const code = (s) => `<pre class="lc-code" tabindex="0"><code>${esc(s)}</code><button type="button" class="lc-copy" aria-label="Copy">Copy</button></pre>`;

  return `
<section class="wrap hero hero-sm">
  <p class="eyebrow">Learn · Run it yourself</p>
  <h1>Run AI <em>at home</em></h1>
  <p class="lede">Every one of the ${fmt(rows.length)} open-weight models we track can run on your own hardware — if it fits. This page reads your computer, works out which models run and how fast, what a tweak or an upgrade would unlock, and gives you the exact commands to set each one up.</p>
  <div class="lhero-actions"><a class="btn" href="#calc">Check my computer</a><a class="btn ghost" href="${root}learn/">← The full Learn guide</a><span class="muted small">${fmt(small)} models fit an 8 GB card · ${fmt(mid)} fit 24 GB</span></div>
</section>

<div class="wrap">
<section class="lc" id="calc" aria-labelledby="lc-h">
  <div class="lc-head"><p class="eyebrow">Calculator</p><h2 id="lc-h">What can <em>my</em> computer run?</h2>
    <p class="muted small" id="lc-detect" aria-live="polite">Reading your hardware…</p></div>
  <form class="lc-form" id="lc-form" autocomplete="off" onsubmit="return false">
    <label class="lc-f"><span>Hardware</span><select id="lc-kind">
      <option value="nvidia">NVIDIA GPU</option><option value="amd">AMD GPU</option><option value="intel">Intel Arc GPU</option>
      <option value="apple">Apple Silicon Mac</option><option value="unified">Unified-memory PC (Ryzen AI Max, DGX Spark)</option><option value="cpu">No GPU (CPU only)</option></select></label>
    <label class="lc-f lc-wide"><span>Model of chip / card</span><select id="lc-gpu"></select></label>
    <label class="lc-f" id="lc-vram-f"><span>GPU memory (VRAM)</span><span class="lc-num"><input id="lc-vram" type="number" min="0" max="1024" step="1" inputmode="numeric"><i>GB</i></span></label>
    <label class="lc-f"><span id="lc-ram-l">System RAM</span><span class="lc-num"><input id="lc-ram" type="number" min="2" max="2048" step="1" inputmode="numeric"><i>GB</i></span></label>
    <label class="lc-f"><span>Memory bandwidth</span><span class="lc-num"><input id="lc-bw" type="number" min="10" max="10000" step="1" inputmode="numeric"><i>GB/s</i></span></label>
    <label class="lc-f"><span>RAM speed (for offload)</span><select id="lc-ramtype"><option value="45">DDR4 dual-channel · ~45 GB/s</option><option value="80" selected>DDR5 dual-channel · ~80 GB/s</option><option value="120">LPDDR5X laptop · ~120 GB/s</option><option value="200">Quad-channel / workstation · ~200 GB/s</option><option value="400">8–12 channel server · ~400 GB/s</option></select></label>
    <label class="lc-f"><span>Context you need</span><select id="lc-ctx"><option value="4096">4K · quick chat</option><option value="16384">16K · chat with files</option><option value="32768" selected>32K · coding agent</option><option value="65536">64K · big repo work</option><option value="131072">128K · long documents</option></select></label>
    <label class="lc-f"><span>Show</span><select id="lc-use"><option value="all">All models</option><option value="tools">Coding agents (tool calling)</option><option value="vis">Can see images</option><option value="r">Reasoning models</option></select></label>
  </form>

  <div class="lc-out" id="lc-out" aria-live="polite"></div>
  <div class="lc-up" id="lc-up"></div>

  <div class="lc-insp" id="lc-insp">
    <div class="lc-ihead"><p class="eyebrow">Model inspector</p>
      <label class="lc-f lc-wide"><span>Model</span><select id="lc-model">${rows.map((r) => `<option value="${esc(r.id)}">${esc(r.n)} · ${esc(r.lab)} · ${params(r.t)}</option>`).join('')}</select></label>
      <label class="lc-f"><span>Quantization</span><select id="lc-quant">${QUANTS.map(([q, b]) => `<option value="${q}"${q === 'Q4_K_M' ? ' selected' : ''}>${q} · ${b} bits</option>`).join('')}</select></label>
      <label class="lc-f"><span>KV cache</span><select id="lc-kv"><option value="1">16-bit (default)</option><option value="0.53">q8_0 · half size</option><option value="0.28">q4_0 · quarter size</option></select></label>
    </div>
    <div class="lc-mem" id="lc-mem"></div>
    <div class="lc-grid2"><div><h3>Tweaks for this model</h3><ul class="lc-tips" id="lc-tips"></ul></div>
      <div><h3>Set it up</h3><div class="lw-seg lw-seg-wrap" role="tablist" id="lc-tabs"></div><div id="lc-cmd"></div></div></div>
  </div>
  <p class="muted small lc-note">Estimates, not promises: real memory use varies by a gigabyte or two with the runtime and drivers, and speed by ±30%. Speeds are for generating text once the prompt is read; reading a long prompt (prefill) is compute-bound and usually much faster per token on a GPU, much slower on a CPU. Your browser can't see exact RAM or VRAM, so check the numbers above — they're saved on this device only.</p>
</section>
</div>

<div class="wrap learn">
<nav class="ltoc" aria-label="On this page"><p class="eyebrow">On this page</p><ol>${LOCAL_SECTIONS.map(([id, t]) => `<li><a href="#${id}">${esc(t)}</a></li>`).join('')}</ol></nav>
<article class="lbody">

<section class="lsec" id="how-local"><div class="lhead"><p class="eyebrow">01 · How local AI works</p><h2>What actually happens on <em>your machine</em></h2></div>
  <p>A model file is just its <strong>weights</strong> — billions of numbers — plus a little metadata. Running it locally means three steps. A <strong>runtime</strong> such as llama.cpp, Ollama, LM Studio, MLX or vLLM loads those numbers into memory, ideally your graphics card's memory (VRAM). Your prompt is turned into tokens and pushed through every layer of the network at once; this is <strong>prefill</strong>, and it's compute-heavy but parallel. Then the model writes its answer one token at a time; this is <strong>decode</strong>, and for each new token the hardware has to read essentially <em>all the active weights</em> from memory again.</p>
  <p>Nothing leaves your computer: no API key, no per-token bill, no rate limits, and it works offline. The trade-offs are that the best open models are big, your hardware sets the ceiling on size and speed, and you're the one keeping it updated.</p>
  <div class="lcallout"><p class="eyebrow">The one-line rule</p><p><strong>Memory decides <em>which</em> models you can run. Memory bandwidth decides <em>how fast</em> they run.</strong> Raw compute matters much less for a single user than most people expect.</p></div>
</section>

<section class="lsec" id="memory"><div class="lhead"><p class="eyebrow">02 · Memory math</p><h2>How much memory a model <em>needs</em></h2></div>
  <p>Three things share the memory: the weights, the KV cache and some working space.</p>
  <p><strong>Weights</strong> = parameters × bits per weight ÷ 8. A 32-billion-parameter model at 16-bit is 64 GB; at a 4-bit quantization (Q4_K_M, about 4.85 bits once its scale factors are counted) it's about 19 GB. That's why quantization is what makes local AI practical.</p>
  <p>The <strong>KV cache</strong> stores, for every token in the context, the attention keys and values of every layer, so they don't have to be recomputed. Its size per token is 2 (keys and values) × layers × KV heads × head size × bytes per number. For a Llama-3-8B-style model that's 2 × 32 × 8 × 128 × 2 bytes = 128 KB per token, so a 32K-token context costs about 4 GB on top of the weights. Newer designs shrink this: grouped-query attention shares keys across heads, DeepSeek-style latent attention compresses them, and hybrid models (Qwen3.5/3.6, Gemma, Nemotron) use full attention on only a fraction of their layers. We read each model's real config, so the calculator uses its true figure.</p>
  <p><strong>Working space</strong> — activation buffers, the runtime and, on a desktop, whatever your screen and browser already use — is typically 0.5 to 1.5 GB.</p>
  ${code(`memory ≈ params × bpw / 8                         # weights
       + 2 × layers × kv_heads × head_dim × 2B × ctx  # KV cache (16-bit)
       + ~0.8 GB                                     # buffers`)}
  <p>If it doesn't fit in VRAM, runtimes can <strong>offload</strong>: some layers stay on the GPU and the rest run from system RAM on the CPU. It works, but every token now waits on the slower memory. Mixture-of-experts models offload unusually well — keep the attention and shared layers on the GPU and push only the big, rarely-used expert weights to RAM (<code>--n-cpu-moe</code> in llama.cpp).</p>
</section>

<section class="lsec" id="speed-local"><div class="lhead"><p class="eyebrow">03 · Why speed = bandwidth</p><h2>Tokens per second, <em>from first principles</em></h2></div>
  <p>Generating one token means reading every <em>active</em> weight once. So the speed limit is simply memory bandwidth divided by the bytes of active weights (plus the part of the KV cache being read). An RTX 4090 moves about 1,000 GB/s; a 19 GB model can therefore manage at most about 50 tokens a second, and real runtimes reach roughly 60–75% of that limit.</p>
  ${code(`tokens/s ≈ efficiency × bandwidth / (active_params × bpw / 8 + kv_read)
# RTX 4090, 32B dense @ Q4_K_M:  0.65 × 1008 / 19.4 ≈ 34 tok/s
# same model on dual-channel DDR5 (CPU): 0.6 × 80 / 19.4 ≈ 2.5 tok/s
# 30B-A3B MoE @ Q4_K_M on that CPU:     0.6 × 80 / 1.8 ≈ 26 tok/s`)}
  <p>That last line is why mixture-of-experts models changed local AI: a 30-billion-parameter MoE with 3 billion active parameters needs the <em>memory</em> of a 30B model but runs at the <em>speed</em> of a 3B one. It's also why Apple Silicon Macs, AMD's Ryzen AI Max and NVIDIA's DGX Spark are popular: their large, fast unified memory holds models no consumer graphics card can.</p>
  <p>Prefill — reading your prompt — is different: it's compute-bound and processes thousands of tokens in parallel. GPUs do hundreds to thousands of tokens a second there; CPUs often only tens, which is why a CPU-only coding agent feels slow even when its typing speed looks fine. Tricks that help: <strong>flash attention</strong> (less memory traffic, needed for a quantized KV cache), <strong>prompt caching</strong> (llama.cpp and Ollama keep the KV cache of your last prompt), and <strong>speculative decoding</strong> (a tiny draft model or the model's own multi-token-prediction head guesses several tokens and the big model checks them in one pass).</p>
</section>

<section class="lsec" id="formats"><div class="lhead"><p class="eyebrow">04 · GGUF, MLX &amp; quant types</p><h2>Which file to <em>download</em></h2></div>
  <p><strong>GGUF</strong> is llama.cpp's single-file format, used by Ollama, LM Studio, Jan and most desktop apps. It runs on NVIDIA, AMD, Intel and Apple GPUs and on plain CPUs. Names describe the quantization: <code>Q4_K_M</code> is a 4-bit “k-quant”, medium mix; <code>Q5_K_M</code> and <code>Q6_K</code> are closer to the original; <code>Q8_0</code> is nearly lossless; <code>IQ</code> types (“i-quants”) squeeze harder using an importance matrix measured on sample text; Unsloth's <code>UD-</code> “dynamic” files keep sensitive layers at higher precision. <code>MXFP4</code> is the 4-bit float format some models (gpt-oss) are trained in natively.</p>
  <p><strong>MLX</strong> is Apple's framework for Apple Silicon; MLX builds are often 10–30% faster than GGUF on a Mac. <strong>Safetensors</strong> in BF16 or FP8 are the original weights, used by vLLM and SGLang on servers with big NVIDIA or AMD GPUs.</p>
  <p>Rules of thumb: Q4_K_M is the sweet spot for most people; prefer a bigger model at Q4 over a smaller one at Q8; below Q3, quality falls off quickly — except for very large MoE models, which tolerate 2–3 bits surprisingly well. The calculator picks the highest quality that still runs smoothly on your machine.</p>
</section>

<section class="lsec" id="setup"><div class="lhead"><p class="eyebrow">05 · Set up in 10 minutes</p><h2>Install a runtime, <em>pull a model</em></h2></div>
  <p><strong>Easiest: Ollama.</strong> Install it from <a href="https://ollama.com/download" rel="noopener">ollama.com</a> (Windows, macOS, Linux). It runs in the background and serves an API on port 11434. Any GGUF on Hugging Face can be pulled directly:</p>
  ${code(`ollama run hf.co/unsloth/Qwen3.5-9B-GGUF:Q4_K_M
# more context, smaller KV cache (set before starting the server)
OLLAMA_CONTEXT_LENGTH=32768 OLLAMA_FLASH_ATTENTION=1 OLLAMA_KV_CACHE_TYPE=q8_0 ollama serve`)}
  <p><strong>Most control: llama.cpp.</strong> Download a release for your GPU from <a href="https://github.com/ggml-org/llama.cpp/releases" rel="noopener">GitHub</a> (CUDA for NVIDIA, Vulkan or ROCm/HIP for AMD and Intel, Metal is built in on Mac), or <code>brew install llama.cpp</code> / <code>winget install llama.cpp</code>. <code>llama-server</code> downloads the model, serves an OpenAI-compatible API on port 8080 and a chat page in your browser. It handles split files for very large models, which Ollama doesn't always.</p>
  ${code(`llama-server -hf unsloth/Qwen3.5-35B-A3B-GGUF:Q4_K_M -c 32768 -ngl 99 -fa on --jinja
# too big for VRAM? keep the experts of the first N layers in system RAM
llama-server -hf unsloth/Qwen3.5-122B-A10B-GGUF:Q4_K_M -c 32768 -ngl 99 --n-cpu-moe 30 -fa on --jinja`)}
  <p><strong>Point and click: LM Studio.</strong> Install from <a href="https://lmstudio.ai" rel="noopener">lmstudio.ai</a>, search a model in Discover, and it shows which quantizations fit your GPU. Turn on the local server (port 1234) to use it from other apps. On a Mac it offers both GGUF and MLX builds.</p>
  <p><strong>Apple Silicon: MLX.</strong> <code>pip install mlx-lm</code>, then <code>mlx_lm.server --model mlx-community/…</code> serves an OpenAI-compatible API. By default macOS lets the GPU use about two-thirds to three-quarters of unified memory; <code>sudo sysctl iogpu.wired_limit_mb=…</code> raises that until the next reboot.</p>
  <p><strong>Servers and multi-GPU: vLLM or SGLang</strong> on Linux with NVIDIA or AMD cards. They batch many requests at once and split a model across GPUs (<code>--tensor-parallel-size 2</code>), at the cost of needing the whole model in VRAM.</p>
  <p>Drivers matter: on NVIDIA keep the driver current; on Windows consider setting <em>CUDA – Sysmem Fallback Policy</em> to “Prefer no sysmem fallback” in the NVIDIA Control Panel, so a model that doesn't fit fails loudly instead of silently crawling. On AMD, check your card first: ROCm (which Ollama's default AMD build and vLLM need) covers the RX 9000 and 7000 series and the RX 6800 and up; the RX 6600/6700 family works on Linux with <code>HSA_OVERRIDE_GFX_VERSION=10.3.0</code>; the RX 5000 series, Vega and the RX 400/500 cards have no ROCm at all and run only through Vulkan — LM Studio's Vulkan runtime, llama.cpp's Vulkan build, or Ollama's Vulkan backend — somewhat slower and with no vLLM. Radeons older than the HD 7000 series can't run models on the GPU.</p>
</section>

<section class="lsec" id="connect"><div class="lhead"><p class="eyebrow">06 · Use it from your coding agent</p><h2>Plug a local model into <em>your tools</em></h2></div>
  <p>All of these runtimes speak the OpenAI chat-completions API, so most coding tools can use them by changing the base URL: <code>http://localhost:11434/v1</code> for Ollama, <code>http://localhost:8080/v1</code> for llama-server, <code>http://localhost:1234/v1</code> for LM Studio. The API key can be any text.</p>
  ${code(`# Aider
aider --model openai/local --openai-api-base http://localhost:8080/v1 --openai-api-key x
# OpenCode (opencode.json)
{ "provider": { "local": { "npm": "@ai-sdk/openai-compatible",
  "options": { "baseURL": "http://localhost:11434/v1" },
  "models": { "qwen3.5:35b-a3b": {} } } } }`)}
  <p>For agents, pick a model with tool calling (filter “Coding agents” above), give it at least 32K of context — agent system prompts and file reads fill it fast — and start llama.cpp with <code>--jinja</code> so the model's own chat template formats tool calls correctly. Browse the agents themselves on our <a href="${root}tools/">Tools page</a>.</p>
</section>

<section class="lsec" id="all"><div class="lhead"><p class="eyebrow">07 · Every open model</p><h2>All ${fmt(rows.length)} open models, <em>sized</em></h2></div>
  <p>Memory is for the weights plus an 8K-token context and buffers. <span class="lc-fitkey">The last column shows how each runs on the computer set in the calculator.</span> Labs with the most open models: ${byLab.slice(0, 6).map(([l, c]) => `${esc(l)} (${c})`).join(', ')}.</p>
  <div class="lc-tablewrap"><table class="lc-table" id="lc-table">
    <thead><tr><th scope="col">Model</th><th scope="col">Params</th><th scope="col">Q4_K_M</th><th scope="col">Q8_0</th><th scope="col">Context</th><th scope="col">Builds</th><th scope="col">On yours</th></tr></thead>
    <tbody>${rows.map((r) => `<tr data-id="${esc(r.id)}"><th scope="row"><a href="${root}${r.p}">${esc(r.n)}</a><small>${esc(r.lab)}${r.tools ? ' · tools' : ''}${r.vis ? ' · vision' : ''}</small></th><td>${params(r.t)}${r.a ? `<small>${params(r.a)} active</small>` : ''}</td><td>${gb(need(r, q4))}</td><td>${gb(need(r, q8))}</td><td>${r.ctx >= 1e6 ? `${+(r.ctx / 1048576).toFixed(1)}M` : `${Math.round(r.ctx / 1024)}K`}</td><td class="lc-links">${r.g ? `<a href="https://huggingface.co/${esc(r.g)}" rel="noopener">GGUF</a>` : ''}${r.mlx ? `<a href="https://huggingface.co/${esc(r.mlx)}" rel="noopener">MLX</a>` : ''}<a href="https://huggingface.co/${esc(r.hf)}" rel="noopener">Original</a></td><td class="lc-fit"><button type="button" class="btn ghost lc-pick" data-id="${esc(r.id)}">Inspect</button></td></tr>`).join('')}</tbody>
  </table></div>
  ${unsized.length ? `<p class="muted small">Not sized yet (no public parameter count): ${unsized.map((m) => esc(m.name)).join(', ')}.</p>` : ''}
  <p class="muted small lsrc">Sizes and attention shapes from each model's Hugging Face repository; GGUF and MLX builds are the most widely used community conversions. Refreshed with the model catalog.</p>
</section>

</article>
</div>
<script type="application/json" id="lc-data">${JSON.stringify(rows).replace(/</g, '\\u003c')}</script>
<script src="${root}assets/local.js?v=${Date.now()}" defer></script>`;
}
