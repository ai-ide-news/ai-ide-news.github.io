// "Run AI at home" calculator (page built by scripts/local.mjs; keep the formulas in step with it).
// Reads what the browser can see of your hardware (WebGPU / WebGL renderer name, CPU cores, a rough RAM
// figure), lets you correct it, then works out for every open model: the best quantization that runs,
// memory needed, expected tokens per second, tweaks, upgrades that would unlock more, and setup commands.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const dataEl = $('#lc-data');
  if (!dataEl) return;
  const MODELS = JSON.parse(dataEl.textContent);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const load = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };

  const QUANTS = [['Q2_K', 2.9], ['Q3_K_M', 3.9], ['Q4_K_M', 4.85], ['Q5_K_M', 5.7], ['Q6_K', 6.6], ['Q8_0', 8.5], ['BF16', 16]];
  const BPW = Object.fromEntries(QUANTS);
  // Repo file tags that stand in for each rung, best match first.
  const TAGS = {
    Q2_K: ['Q2_K', 'UD-Q2_K_XL', 'Q2_K_L', 'UD-IQ2_M', 'IQ2_M', 'UD-IQ2_XXS', 'IQ2_XXS'],
    Q3_K_M: ['Q3_K_M', 'UD-Q3_K_XL', 'Q3_K_L', 'IQ3_M', 'UD-IQ3_XXS', 'Q3_K_S', 'IQ3_XS'],
    Q4_K_M: ['Q4_K_M', 'UD-Q4_K_XL', 'Q4_K_L', 'MXFP4_MOE', 'MXFP4', 'Q4_K_S', 'IQ4_XS', 'UD-IQ4_XS', 'Q4_0'],
    Q5_K_M: ['Q5_K_M', 'UD-Q5_K_XL', 'Q5_K_L', 'Q5_K_S'],
    Q6_K: ['Q6_K', 'UD-Q6_K_XL', 'Q6_K_L', 'UD-Q6_K_S'],
    Q8_0: ['Q8_0', 'UD-Q8_K_XL'],
    BF16: ['BF16', 'F16'],
  };
  const tagFor = (m, q) => (m.q ? TAGS[q].find((t) => m.q.includes(t)) || null : (q === 'Q4_K_M' || q === 'Q8_0' ? q : null));

  // ── GPU catalogue: [name, VRAM GB, bandwidth GB/s, match] ──
  const GPUS = {
    nvidia: [
      ['RTX PRO 6000 Blackwell', 96, 1792], ['RTX 6000 Ada', 48, 960], ['RTX A6000', 48, 768], ['RTX 5090', 32, 1792], ['RTX 5080', 16, 960], ['RTX 5070 Ti', 16, 896],
      ['RTX 5070', 12, 672], ['RTX 5060 Ti 16GB', 16, 448], ['RTX 5060 Ti 8GB', 8, 448], ['RTX 5060', 8, 448], ['RTX 5090 Laptop', 24, 896], ['RTX 5080 Laptop', 16, 896],
      ['RTX 5070 Ti Laptop', 12, 672], ['RTX 5070 Laptop', 8, 384], ['RTX 5060 Laptop', 8, 384], ['RTX 4090', 24, 1008], ['RTX 4080 SUPER', 16, 736], ['RTX 4080', 16, 717],
      ['RTX 4070 Ti SUPER', 16, 672], ['RTX 4070 Ti', 12, 504], ['RTX 4070 SUPER', 12, 504], ['RTX 4070', 12, 504], ['RTX 4060 Ti 16GB', 16, 288], ['RTX 4060 Ti', 8, 288],
      ['RTX 4060', 8, 272], ['RTX 4090 Laptop', 16, 576], ['RTX 4080 Laptop', 12, 432], ['RTX 4070 Laptop', 8, 256], ['RTX 4060 Laptop', 8, 256], ['RTX 4050 Laptop', 6, 192],
      ['RTX 3090 Ti', 24, 1008], ['RTX 3090', 24, 936], ['RTX 3080 Ti', 12, 912], ['RTX 3080 12GB', 12, 912], ['RTX 3080', 10, 760], ['RTX 3070 Ti', 8, 608], ['RTX 3070', 8, 448],
      ['RTX 3060 Ti', 8, 448], ['RTX 3060', 12, 360], ['RTX 3050', 8, 224], ['RTX 3080 Laptop', 16, 448], ['RTX 3070 Laptop', 8, 448], ['RTX 3060 Laptop', 6, 336],
      ['RTX 2080 Ti', 11, 616], ['RTX 2080 SUPER', 8, 496], ['RTX 2080', 8, 448], ['RTX 2070', 8, 448], ['RTX 2060', 6, 336], ['GTX 1080 Ti', 11, 484], ['GTX 1080', 8, 320],
      ['GTX 1070', 8, 256], ['GTX 1660 SUPER', 6, 336], ['GTX 1660', 6, 192], ['GTX 1650', 4, 128], ['GTX 1060', 6, 192], ['TITAN RTX', 24, 672], ['A100 80GB', 80, 2039], ['H100', 80, 3350], ['L40S', 48, 864], ['Tesla P40', 24, 347],
    ],
    amd: [
      ['RX 9070 XT', 16, 640], ['RX 9070', 16, 640], ['RX 9060 XT 16GB', 16, 322], ['RX 9060 XT 8GB', 8, 322], ['RX 7900 XTX', 24, 960], ['RX 7900 XT', 20, 800], ['RX 7900 GRE', 16, 576],
      ['RX 7800 XT', 16, 624], ['RX 7700 XT', 12, 432], ['RX 7600 XT', 16, 288], ['RX 7600', 8, 288], ['RX 6950 XT', 16, 576], ['RX 6900 XT', 16, 512], ['RX 6800 XT', 16, 512],
      ['RX 6800', 16, 512], ['RX 6700 XT', 12, 384], ['RX 6750 XT', 12, 432], ['RX 6650 XT', 8, 280], ['RX 6600 XT', 8, 256], ['RX 6600', 8, 224], ['RX 5700 XT', 8, 448], ['RX 5700', 8, 448], ['RX 5600 XT', 6, 288], ['RX 5500 XT', 8, 224], ['Radeon VII', 16, 1024], ['RX Vega 64', 8, 484], ['RX 590', 8, 256], ['RX 580', 8, 256], ['RX 570', 8, 224], ['Radeon PRO W7900', 48, 864], ['Radeon AI PRO R9700', 32, 640], ['Instinct MI300X', 192, 5300],
      ['Older Radeon (RX 400 / 500 / R9)', 4, 180],
    ],
    intel: [['Arc Pro B60', 24, 456], ['Arc B580', 12, 456], ['Arc B570', 10, 380], ['Arc A770 16GB', 16, 560], ['Arc A770 8GB', 8, 512], ['Arc A750', 8, 512], ['Arc A580', 8, 512]],
    // Unified memory: [name, default memory GB, bandwidth]
    apple: [
      ['M1', 16, 68], ['M1 Pro', 32, 200], ['M1 Max', 64, 400], ['M1 Ultra', 128, 800], ['M2', 16, 100], ['M2 Pro', 32, 200], ['M2 Max', 64, 400], ['M2 Ultra', 192, 800],
      ['M3', 16, 100], ['M3 Pro', 36, 150], ['M3 Max', 64, 400], ['M3 Ultra', 256, 819], ['M4', 16, 120], ['M4 Pro', 48, 273], ['M4 Max', 64, 546], ['M5', 16, 153],
    ],
    unified: [['Ryzen AI Max+ 395 (Strix Halo)', 128, 256], ['Ryzen AI Max 390 / 385', 64, 256], ['NVIDIA DGX Spark (GB10)', 128, 273], ['Ryzen AI 300 laptop (iGPU)', 32, 120], ['Intel Core Ultra (iGPU)', 32, 120]],
    cpu: [['Desktop / laptop CPU', 0, 80]],
  };

  // ── Which backend a card actually gets ───────────────────
  // Not every Radeon runs ROCm. RDNA3/4 and the RX 6800+ are supported (Linux, and Windows through Ollama /
  // LM Studio); the rest of RDNA2 needs a gfx override on Linux; RDNA1 (RX 5000), Vega and Polaris have no ROCm
  // at all and only run through Vulkan, which is slower and rules out vLLM. NVIDIA, Intel and Apple are native.
  const AMD_OVERRIDE = /^RX 6[67]/;
  const AMD_VULKAN = /^(RX 5\d00|RX Vega|Radeon VII|RX 5[789]0$|Older Radeon)/;
  const AMD_OLD = /^(RX 5[789]0$|Older Radeon)/;
  function backend(hw) {
    if (hw.kind !== 'amd') return { api: 'native', eff: 0.65 };
    if (AMD_OVERRIDE.test(hw.gpu)) return { api: 'override', eff: 0.55 };
    if (AMD_VULKAN.test(hw.gpu)) return { api: 'vulkan', eff: AMD_OLD.test(hw.gpu) ? 0.4 : 0.5, old: AMD_OLD.test(hw.gpu) };
    return { api: 'rocm', eff: 0.65 };
  }
  const BACKEND_NOTE = {
    override: '<b>No official ROCm for the RX 6600 / 6700 family.</b> On Linux, ROCm works if you set <code>HSA_OVERRIDE_GFX_VERSION=10.3.0</code>; on Windows, Ollama’s ROCm build skips these cards, so use a Vulkan runtime — LM Studio, llama.cpp’s Vulkan build, or Ollama’s Vulkan backend. Speeds below assume Vulkan.',
    vulkan: '<b>This card has no ROCm support</b> — AMD never added RDNA1 (RX 5000) and has dropped Vega and Polaris, so Ollama’s default AMD build and vLLM won’t use it. It still runs local AI through <b>Vulkan</b>: LM Studio (Vulkan runtime), llama.cpp’s Vulkan build, or Ollama’s Vulkan backend. Speeds below are already lowered for that.',
    old: ' Cards this old are also slow at reading long prompts, so keep the context short.',
  };

  const els = {
    kind: $('#lc-kind'), gpu: $('#lc-gpu'), vram: $('#lc-vram'), vramF: $('#lc-vram-f'), ram: $('#lc-ram'), ramL: $('#lc-ram-l'), bw: $('#lc-bw'),
    ramtype: $('#lc-ramtype'), ctx: $('#lc-ctx'), use: $('#lc-use'), out: $('#lc-out'), up: $('#lc-up'), detect: $('#lc-detect'),
    model: $('#lc-model'), quant: $('#lc-quant'), kv: $('#lc-kv'), mem: $('#lc-mem'), tips: $('#lc-tips'), tabs: $('#lc-tabs'), cmd: $('#lc-cmd'),
  };
  const unifiedKind = (k) => k === 'apple' || k === 'unified';

  // ── Hardware detection ───────────────────────────────────
  async function detect() {
    const info = { cores: navigator.hardwareConcurrency || null, mem: navigator.deviceMemory || null, renderer: '', vendor: '', platform: '', arch: '', webgpu: false };
    try {
      const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
      const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      if (gl) info.renderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || '');
      if (gl && ext) info.vendor = String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || '');
    } catch { /* no WebGL */ }
    try {
      const a = navigator.gpu && await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (a) {
        info.webgpu = true;
        const i = a.info || (a.requestAdapterInfo ? await a.requestAdapterInfo() : {});
        info.gpuVendor = i.vendor || ''; info.gpuArch = i.architecture || ''; info.gpuDesc = i.description || '';
      }
    } catch { /* no WebGPU */ }
    try {
      const h = navigator.userAgentData && await navigator.userAgentData.getHighEntropyValues(['platform', 'architecture', 'model']);
      if (h) { info.platform = h.platform || ''; info.arch = h.architecture || ''; }
    } catch { /* not Chromium */ }
    if (!info.platform) info.platform = /Mac/.test(navigator.platform) ? 'macOS' : /Win/.test(navigator.platform) ? 'Windows' : /Linux/.test(navigator.platform) ? 'Linux' : '';
    return info;
  }

  // Match a renderer string ("ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Laptop GPU …)") to the catalogue.
  function guess(info) {
    const r = `${info.renderer} ${info.gpuDesc || ''}`.replace(/\(0x[0-9a-f]+\)/gi, ' ');
    const norm = (s) => s.toLowerCase().replace(/geforce|radeon|nvidia|amd|intel\(r\)|graphics|\s+/g, '');
    const laptop = /laptop|mobile|max-q/i.test(r);
    for (const kind of ['nvidia', 'amd', 'intel']) {
      const hits = GPUS[kind].filter(([n]) => norm(r).includes(norm(n.replace(/ (Laptop|\d+GB)$/, '')))).filter(([n]) => /Laptop/.test(n) === laptop || !GPUS[kind].some(([m]) => m === `${n} Laptop`));
      if (hits.length) return { kind, name: hits.sort((a, b) => b[0].length - a[0].length)[0][0] };
    }
    const apple = r.match(/Apple (M\d)( Pro| Max| Ultra)?/i);
    if (apple) return { kind: 'apple', name: `${apple[1].toUpperCase()}${apple[2] || ''}` };
    if (/Apple/i.test(r) || (info.platform === 'macOS' && info.arch === 'arm') || /apple/i.test(info.gpuVendor || '')) return { kind: 'apple', name: 'M1' };
    if (/Radeon\(TM\) 8060S|8060S|Strix Halo/i.test(r)) return { kind: 'unified', name: 'Ryzen AI Max+ 395 (Strix Halo)' };
    if (/Radeon.*(880M|890M|780M|760M)|Radeon\(TM\) Graphics/i.test(r)) return { kind: 'unified', name: 'Ryzen AI 300 laptop (iGPU)' };
    if (/Intel.*(Arc|Iris|UHD|Graphics)/i.test(r) && !/Arc (A|B)\d{3}/i.test(r)) return { kind: 'unified', name: 'Intel Core Ultra (iGPU)' };
    if (/nvidia/i.test(info.gpuVendor || '') || /nvidia/i.test(r)) return { kind: 'nvidia', name: 'RTX 4060' };
    if (/Radeon.*\bHD [56]\d{3}/i.test(r)) return { kind: 'cpu', name: 'Desktop / laptop CPU' }; // pre-GCN: no Vulkan compute
    if (/\bRX [45][4-9]0\b|\bR[579] \d{3}|\bHD [78]\d{3}/i.test(r)) return { kind: 'amd', name: 'Older Radeon (RX 400 / 500 / R9)' };
    if (/amd|ati/i.test(info.gpuVendor || '') || /amd|radeon/i.test(r)) return { kind: 'amd', name: 'RX 7600' };
    return { kind: 'cpu', name: 'Desktop / laptop CPU' };
  }

  // ── State ────────────────────────────────────────────────
  let S = load('lc-hw') || null;
  const fillGpus = () => {
    els.gpu.replaceChildren(...GPUS[els.kind.value].map(([n, v, b]) => new Option(unifiedKind(els.kind.value) ? `${n} · ${b} GB/s` : els.kind.value === 'cpu' ? n : `${n} · ${v} GB · ${b} GB/s`, n)));
    els.vramF.hidden = unifiedKind(els.kind.value) || els.kind.value === 'cpu';
    els.ramL.textContent = unifiedKind(els.kind.value) ? 'Unified memory' : 'System RAM';
  };
  const gpuRow = () => GPUS[els.kind.value].find(([n]) => n === els.gpu.value) || GPUS[els.kind.value][0];
  const read = () => ({
    kind: els.kind.value, gpu: els.gpu.value, vram: +els.vram.value || 0, ram: +els.ram.value || 8, bw: +els.bw.value || 60,
    rambw: +els.ramtype.value, ctx: +els.ctx.value, use: els.use.value,
  });
  const write = (s) => {
    els.kind.value = s.kind; fillGpus(); els.gpu.value = s.gpu; els.vram.value = s.vram; els.ram.value = s.ram; els.bw.value = s.bw;
    els.ramtype.value = String(s.rambw); els.ctx.value = String(s.ctx); els.use.value = s.use || 'all';
  };

  // ── The model ────────────────────────────────────────────
  // Usable memory for weights + cache, and the bandwidth each part is read at.
  function budget(hw) {
    if (hw.kind === 'apple') {
      const gpu = hw.ram * (hw.ram >= 64 ? 0.75 : 0.66);
      return { gpu, cpu: 0, gpuBw: hw.bw, cpuBw: hw.bw, unified: true, raisable: hw.ram - 8 - gpu };
    }
    if (hw.kind === 'unified') return { gpu: hw.ram * (hw.gpu.startsWith('Ryzen AI Max') || hw.gpu.includes('Spark') ? 0.9 : 0.5) - 4, cpu: 0, gpuBw: hw.bw, cpuBw: hw.bw, unified: true };
    if (hw.kind === 'cpu') return { gpu: 0, cpu: Math.max(0, hw.ram - 6), gpuBw: 0, cpuBw: hw.rambw };
    return { gpu: Math.max(0, hw.vram - 0.6), cpu: Math.max(0, hw.ram - 6), gpuBw: hw.bw, cpuBw: hw.rambw };
  }
  const OVER = 0.8;
  // Memory and speed for one model at one quantization.
  function plan(m, q, hw, kvf = 1) {
    const bpw = BPW[q];
    const w = m.t * bpw / 8;
    const ctx = Math.min(hw.ctx, m.ctx || hw.ctx);
    const kv = m.kv * ctx * kvf / 1e9;
    const total = w + kv + OVER;
    const B = budget(hw), eff = backend(hw).eff;
    const active = (m.a || m.t) * bpw / 8 + kv * 0.5; // bytes read per token: active weights + half-full cache
    let where, tps, gpuShare = 0;
    // Plus a fixed few milliseconds per token of kernel launches and sampling, which caps tiny/MoE models.
    if (B.gpu > 0 && total <= B.gpu) { where = 'gpu'; gpuShare = 1; tps = 1 / (active / (eff * B.gpuBw) + 0.004); }
    else if (total <= B.gpu + B.cpu && B.cpu > 0) {
      where = B.gpu > 0 ? 'split' : 'cpu';
      // Cache and buffers stay on the GPU; weights fill what's left. MoE models keep their dense parts on the GPU,
      // so the share of *active* bytes served by the GPU is better than the share of total weights.
      const room = Math.max(0, B.gpu - kv - OVER);
      gpuShare = Math.min(1, room / w);
      const activeShare = m.a && B.gpu > 0 ? Math.min(1, gpuShare + (1 - gpuShare) * 0.45) : gpuShare;
      const g = active * activeShare, c = active - g;
      tps = 1 / ((B.gpuBw ? g / (eff * B.gpuBw) : 0) + c / (0.55 * B.cpuBw) + 0.006);
    } else { where = 'no'; tps = 0; }
    return { q, bpw, w, kv, total, ctx, where, tps, gpuShare, budget: B };
  }
  const QUALITY = { Q2_K: 0.78, Q3_K_M: 0.9, Q4_K_M: 0.96, Q5_K_M: 0.98, Q6_K: 0.99, Q8_0: 1, BF16: 1 };
  // Best runnable quantization: the highest quality that's still smooth; otherwise the highest that's usable.
  function best(m, hw) {
    const rungs = QUANTS.map(([q]) => q).filter((q) => q !== 'BF16' || m.t <= 4).filter((q) => q !== 'Q2_K' || m.t >= 100);
    const ps = rungs.map((q) => plan(m, q, hw)).filter((p) => p.where !== 'no' && p.tps >= 2);
    if (!ps.length) return null;
    const smooth = ps.filter((p) => p.tps >= 15);
    return (smooth.length ? smooth : ps).sort((a, b) => b.bpw - a.bpw)[0];
  }
  const rate = (tps) => (tps >= 20 ? ['smooth', 'Smooth'] : tps >= 8 ? ['usable', 'Usable'] : tps >= 3 ? ['slow', 'Slow'] : ['crawl', 'Very slow']);
  const score = (m, p) => (m.i != null ? m.i * 3 : 0) + Math.log2(m.t + 1) * 8 * QUALITY[p.q] + (Date.parse(m.d) - Date.parse('2024-01-01')) / 864e5 / 60;
  const gbs = (n) => (n >= 100 ? `${Math.round(n)} GB` : n >= 10 ? `${n.toFixed(0)} GB` : `${n.toFixed(1)} GB`);
  const ps = (b) => (b >= 1000 ? `${+(b / 1000).toFixed(2)}T` : `${+b.toFixed(b < 10 ? 1 : 0)}B`);
  const tpsTxt = (t) => (t >= 100 ? `${Math.round(t / 10) * 10}+` : t >= 10 ? Math.round(t) : t.toFixed(1));
  const filt = (hw) => MODELS.filter((m) => hw.use === 'all' || m[hw.use]);
  // Special-purpose models (translation, safety classifiers, speech) never headline a recommendation.
  const SPECIAL = /guard|safety|safeguard|-MT\d|voxtral|asr/i;
  const general = (m) => !SPECIAL.test(m.n);

  // ── Results ──────────────────────────────────────────────
  function results(hw) {
    const list = filt(hw).map((m) => ({ m, p: best(m, hw) }));
    const ok = list.filter((r) => r.p).sort((a, b) => score(b.m, b.p) - score(a.m, a.p));
    const groups = { smooth: [], usable: [], slow: [], crawl: [] };
    ok.forEach((r) => groups[rate(r.p.tps)[0]].push(r));
    const B = budget(hw);
    const gen = ok.filter((r) => general(r.m));
    const strongest = gen.find((r) => r.p.tps >= 8) || gen[0];
    // The other two picks avoid repeating a model already shown, when there's an alternative.
    const coder = gen.find((r) => r.m.tools && r.p.tps >= 10 && r !== strongest) || gen.find((r) => r.m.tools && r.p.tps >= 10);
    const quick = [...gen].filter((r) => r.m.t >= 3).sort((a, b) => b.p.tps - a.p.tps);
    const fastest = quick.find((r) => r !== strongest && r !== coder) || quick[0] || [...gen].sort((a, b) => b.p.tps - a.p.tps)[0];
    const pick = (label, r, why) => r ? `<button type="button" class="lc-pickcard" data-id="${esc(r.m.id)}" data-q="${r.p.q}"><span class="eyebrow">${label}</span><strong>${esc(r.m.n)}</strong><small>${r.p.q} · ${gbs(r.p.total)} · ~${tpsTxt(r.p.tps)} tok/s</small><em>${why}</em></button>` : '';
    const row = (r) => `<li><button type="button" class="lc-row" data-id="${esc(r.m.id)}" data-q="${r.p.q}"><i class="lsq" style="--c:${esc(r.m.c || '#888')}"></i><span class="lc-rn">${esc(r.m.n)}<small>${esc(r.m.lab)} · ${ps(r.m.t)}${r.m.a ? ` (${ps(r.m.a)} active)` : ''}${r.m.tools ? ' · tools' : ''}${r.m.vis ? ' · vision' : ''}</small></span><span class="lc-rq">${r.p.q}</span><span class="lc-rm">${gbs(r.p.total)}${r.p.where === 'split' ? `<small>${Math.round(r.p.gpuShare * 100)}% on GPU</small>` : r.p.where === 'cpu' ? '<small>CPU</small>' : ''}</span><span class="lc-rt">${tpsTxt(r.p.tps)}<small>tok/s</small></span></button></li>`;
    const LABEL = { smooth: ['Runs smoothly', '20+ tokens a second — faster than you read'], usable: ['Usable', '8–20 tokens a second'], slow: ['Slow but works', '3–8 tokens a second: fine for overnight jobs'], crawl: ['Technically runs', 'Under 3 tokens a second'] };
    const none = list.length - ok.length;
    const be = backend(hw);
    const note = BACKEND_NOTE[be.api] ? `<p class="lc-warn">${BACKEND_NOTE[be.api]}${be.old ? BACKEND_NOTE.old : ''}</p>` : '';
    els.out.innerHTML = `
      <div class="lc-sum"><p><b>${ok.length}</b> of ${list.length} models run on this machine${B.gpu ? ` · <b>${gbs(B.gpu)}</b> usable ${B.unified ? 'unified memory for the GPU' : 'VRAM'}` : ''}${B.cpu ? ` + <b>${gbs(B.cpu)}</b> RAM for offload` : ''} · ${hw.ctx / 1024}K context</p>${note}</div>
      <div class="lc-picks">${pick('Strongest that runs', strongest, 'Highest-rated model you can run at a usable speed')}${pick('Best for coding agents', coder, 'Tool calling, 10+ tokens a second')}${pick('Fastest', fastest, 'For autocomplete and quick questions')}</div>
      ${Object.entries(groups).filter(([, a]) => a.length).map(([k, a]) => `<details class="lc-group lc-${k}"${k === 'smooth' || (k === 'usable' && !groups.smooth.length) ? ' open' : ''}><summary><b>${LABEL[k][0]}</b> <span class="lc-n">${a.length}</span><small>${LABEL[k][1]}</small></summary><ul class="lc-rows">${a.map(row).join('')}</ul></details>`).join('')}
      ${none ? `<p class="muted small">${none} more ${none === 1 ? 'model needs' : 'models need'} more memory than this machine has — see what an upgrade unlocks below.</p>` : ''}`;
    // Fit column of the big table
    $$('#lc-table tbody tr').forEach((tr) => {
      const m = MODELS.find((x) => x.id === tr.dataset.id); const p = m && best(m, hw); const cell = $('.lc-fit', tr);
      const [k, l] = p ? rate(p.tps) : ['no', 'Doesn’t fit'];
      cell.innerHTML = `<button type="button" class="lc-badge lc-${k} lc-pick" data-id="${esc(tr.dataset.id)}"${p ? ` data-q="${p.q}"` : ''}>${p ? `${l} · ${p.q} · ${tpsTxt(p.tps)} t/s` : l}</button>`;
    });
    return ok;
  }

  // ── Upgrades: what one change would unlock ───────────────
  const UPS = {
    vram: [[12, 'RTX 5070', 672], [16, 'RTX 5070 Ti or RX 9070 XT', 896], [24, 'RTX 4090, or a used RTX 3090 / RX 7900 XTX', 1008], [32, 'RTX 5090', 1792], [48, 'two RTX 3090s, or RTX 6000 Ada', 936], [96, 'RTX PRO 6000 Blackwell', 1792]],
    ram: [16, 32, 64, 96, 128, 192, 256],
    box: [['Mac with 64 GB (M4 Max)', 'apple', 64, 546], ['Ryzen AI Max+ 395 mini-PC, 128 GB', 'unified', 128, 256], ['Mac Studio M3 Ultra, 256 GB', 'apple', 256, 819]],
  };
  function upgrades(hw, have) {
    const good = (h) => new Set(filt(h).filter((m) => { const p = best(m, h); return p && p.tps >= 8; }).map((m) => m.id));
    const now = good(hw);
    const opts = [];
    const add = (label, detail, h) => {
      const g = good(h); const gained = [...g].filter((id) => !now.has(id));
      if (!gained.length) return;
      const names = gained.map((id) => MODELS.find((m) => m.id === id)).filter(general).sort((a, b) => (b.i ?? 0) - (a.i ?? 0) || b.t - a.t).slice(0, 4).map((m) => esc(m.n));
      opts.push({ label, detail, n: gained.length, names });
    };
    if (['nvidia', 'amd', 'intel'].includes(hw.kind)) {
      const v = UPS.vram.find(([gb]) => gb > hw.vram); if (v) add(`Upgrade to a ${v[0]} GB card`, `e.g. ${v[1]}`, { ...hw, gpu: v[1], vram: v[0], bw: Math.max(hw.bw, v[2]) });
      const v2 = UPS.vram.filter(([gb]) => gb > hw.vram)[1]; if (v2) add(`Upgrade to a ${v2[0]} GB card`, `e.g. ${v2[1]}`, { ...hw, gpu: v2[1], vram: v2[0], bw: Math.max(hw.bw, v2[2]) });
    }
    if (hw.kind === 'cpu') { add('Add a 16 GB graphics card', 'e.g. RTX 5060 Ti 16GB or RX 9060 XT 16GB', { ...hw, kind: 'nvidia', vram: 16, bw: 448 }); add('Add a 24 GB graphics card', 'e.g. a used RTX 3090', { ...hw, kind: 'nvidia', vram: 24, bw: 936 }); }
    if (!unifiedKind(hw.kind)) {
      const r = UPS.ram.find((x) => x >= hw.ram * 2) || UPS.ram.find((x) => x > hw.ram);
      if (r) add(`Add RAM: ${r} GB`, 'Cheapest upgrade — big mixture-of-experts models run with their experts in RAM', { ...hw, ram: r });
      if (hw.rambw < 80) add('Faster RAM (DDR5)', 'Offloaded layers run at RAM speed', { ...hw, rambw: 80 });
    }
    for (const [label, kind, ram, bw] of UPS.box) if (!(unifiedKind(hw.kind) && hw.ram >= ram)) add(label, 'Unified memory: the GPU can use most of it', { ...hw, kind, gpu: label, ram, bw });
    // Parts first (cheaper), then whole new machines; each group by how much it unlocks.
    opts.forEach((o) => { o.box = /Mac|mini-PC/.test(o.label); });
    opts.sort((a, b) => a.box - b.box || b.n - a.n);
    els.up.innerHTML = opts.length ? `<h3>What an upgrade would unlock</h3><p class="muted small">Models that would run at 8+ tokens a second and don't today${hw.use !== 'all' ? ', within the current filter' : ''}.</p><ul class="lc-ups">${[...opts.filter((o) => !o.box).slice(0, 3), ...opts.filter((o) => o.box).slice(0, 2)].map((o) => `<li><b>${o.box ? 'Or a ' : ''}${o.box ? o.label.replace(/^Mac/, 'Mac') : o.label}</b><small>${o.detail}</small><span class="lc-gain">+${o.n} model${o.n === 1 ? '' : 's'}</span><em>${o.names.join(', ')}${o.n > o.names.length ? '…' : ''}</em></li>`).join('')}</ul>` : `<h3>What an upgrade would unlock</h3><p class="muted small">Your machine already runs ${have.length ? 'everything we track at a usable speed' : 'nothing yet'}.</p>`;
  }

  // ── Inspector ────────────────────────────────────────────
  let tab = load('lc-tab') || 'ollama';
  function inspect(hw) {
    const m = MODELS.find((x) => x.id === els.model.value) || MODELS[0];
    const q = els.quant.value, kvf = +els.kv.value;
    const p = plan(m, q, hw, kvf);
    const B = p.budget, cap = B.gpu + B.cpu;
    const scale = Math.max(p.total, cap, 1) * 1.04;
    const pct = (v) => `${(v / scale * 100).toFixed(2)}%`;
    const [rk, rl] = p.where === 'no' ? ['no', 'Doesn’t fit'] : rate(p.tps);
    els.mem.innerHTML = `
      <div class="lc-verdict lc-${rk}"><b>${rl}</b><span>${p.where === 'gpu' ? `Fits entirely in ${B.unified ? 'unified memory' : 'VRAM'}` : p.where === 'split' ? `${Math.round(p.gpuShare * 100)}% of the weights on the GPU, the rest in RAM` : p.where === 'cpu' ? 'Runs on the CPU from system RAM' : `Needs ${gbs(p.total)}; this machine has ${gbs(cap)} available`}${p.tps ? ` · about <b>${tpsTxt(p.tps)} tokens/s</b>` : ''}</span></div>
      <div class="lc-bar" aria-hidden="true"><i class="w" style="width:${pct(p.w)}"></i><i class="k" style="width:${pct(p.kv)}"></i><i class="o" style="width:${pct(OVER)}"></i>${B.gpu ? `<s class="lim" style="left:${pct(B.gpu)}"><span>${B.unified ? 'GPU limit' : 'VRAM'}</span></s>` : ''}${B.cpu ? `<s class="lim lim2" style="left:${pct(cap)}"><span>+ RAM</span></s>` : ''}</div>
      <dl class="lc-dl"><div><dt>Weights</dt><dd>${gbs(p.w)}<small>${ps(m.t)} × ${p.bpw} bits</small></dd></div><div><dt>KV cache</dt><dd>${gbs(p.kv)}<small>${(p.ctx / 1024).toFixed(0)}K tokens × ${Math.round(m.kv * kvf / 1024)} KB${m.kvEst ? ' (est.)' : ''}</small></dd></div><div><dt>Buffers</dt><dd>${gbs(OVER)}</dd></div><div><dt>Total</dt><dd><b>${gbs(p.total)}</b></dd></div><div><dt>Read per token</dt><dd>${gbs((m.a || m.t) * p.bpw / 8)}<small>${m.a ? `only ${ps(m.a)} active (MoE)` : 'dense: all weights'}</small></dd></div></dl>`;
    els.tips.innerHTML = tips(m, p, hw, kvf).map((t) => `<li>${t}</li>`).join('');
    commands(m, p, hw, kvf);
  }

  function tips(m, p, hw, kvf) {
    const out = [], B = p.budget;
    const at = (q) => plan(m, q, hw, kvf);
    const lower = QUANTS.map(([q]) => q).filter((q) => BPW[q] < p.bpw && q !== 'Q2_K').reverse().map(at).find((x) => x.where === 'gpu' || (p.where === 'no' && x.where !== 'no'));
    if (p.where !== 'gpu' && lower) out.push(`<b>Drop to ${lower.q}.</b> Saves ${gbs(p.total - lower.total)} and ${lower.where === 'gpu' ? 'fits entirely on the GPU' : 'fits'} — about ${tpsTxt(lower.tps)} tokens/s.`);
    if (p.kv > 1 && kvf === 1) out.push(`<b>Quantize the KV cache to q8_0.</b> Halves it (saves ${gbs(p.kv * 0.47)}) with almost no quality loss. llama.cpp: <code>-fa on -ctk q8_0 -ctv q8_0</code>; Ollama: <code>OLLAMA_KV_CACHE_TYPE=q8_0</code>.`);
    if (p.ctx > 16384 && p.kv > 2) out.push(`<b>Use less context.</b> 16K instead of ${p.ctx / 1024}K saves ${gbs(p.kv * (1 - 16384 / p.ctx))}. Agents need 32K+, chat rarely does.`);
    if (p.where === 'split' && m.a) out.push(`<b>Offload experts, not layers.</b> It's a mixture-of-experts model: keep attention on the GPU and send expert weights to RAM with <code>--n-cpu-moe N</code> (raise N until it loads). Often 2–3× faster than plain layer offload.`);
    if (p.where === 'split' && !m.a) out.push('<b>Partial offload works, but slowly.</b> Each token waits on system RAM. A mixture-of-experts model of similar quality will be much faster on this machine.');
    if (hw.kind === 'apple' && B.raisable > 2) out.push(`<b>Let the GPU use more memory.</b> macOS caps it at ${gbs(B.gpu)}. <code>sudo sysctl iogpu.wired_limit_mb=${Math.round((hw.ram - 8) * 1024)}</code> raises it to ${hw.ram - 8} GB until reboot.`);
    if (hw.kind === 'apple' && m.mlx) out.push('<b>Try the MLX build.</b> Usually 10–30% faster than GGUF on Apple Silicon.');
    if (hw.kind === 'nvidia' && p.where !== 'gpu') out.push('<b>Windows + NVIDIA:</b> set “CUDA – Sysmem Fallback Policy” to “Prefer no sysmem fallback” so the driver doesn’t silently spill VRAM into slow shared memory.');
    if (['nvidia', 'amd', 'intel'].includes(hw.kind) && p.where !== 'no' && p.total > B.gpu - 1.5 && p.total <= B.gpu + 1.5) out.push('<b>Free up VRAM.</b> Close games and turn off hardware acceleration in your browser and chat apps — that frees 0.5–1.5 GB on a card that also drives your screen.');
    if (p.where === 'cpu' || (p.where === 'split' && p.gpuShare < 0.5)) out.push(`<b>Use your physical cores.</b> Set threads to your physical core count (<code>-t ${Math.max(2, Math.round((navigator.hardwareConcurrency || 8) / 2))}</code>); hyper-threads don't help memory-bound work.`);
    if (p.where !== 'no' && p.tps < 15 && p.tps > 0) out.push('<b>Speculative decoding.</b> If the model ships a multi-token-prediction head or a small sibling exists, llama.cpp and vLLM can draft tokens with it and verify in bulk — often 1.5–2.5× faster for code.');
    if (m.gated) out.push('<b>Gated model.</b> The original weights need you to accept a licence on Hugging Face; community GGUF builds usually don’t.');
    if (p.where === 'no') {
      const sib = MODELS.filter((x) => x.lab === m.lab && x.id !== m.id).map((x) => ({ x, b: best(x, hw) })).filter((r) => r.b && general(r.x)).sort((a, b) => (b.b.tps >= 8) - (a.b.tps >= 8) || b.x.t - a.x.t)[0];
      if (sib) out.push(`<b>Try a smaller ${esc(m.lab)} model:</b> ${esc(sib.x.n)} runs at ${sib.b.q}, about ${tpsTxt(sib.b.tps)} tokens/s.`);
    }
    if (!out.length) out.push('Nothing to change — it fits with room to spare. Try a higher quantization or a longer context.');
    return out;
  }

  function commands(m, p, hw, kvf) {
    const tag = tagFor(m, p.q);
    const ctx = p.ctx;
    const kvFlags = kvf < 1 ? ` -ctk ${kvf < 0.5 ? 'q4_0' : 'q8_0'} -ctv ${kvf < 0.5 ? 'q4_0' : 'q8_0'}` : '';
    const moe = p.where === 'split' && m.a ? ' --n-cpu-moe 20' : '';
    const ngl = p.where === 'cpu' ? ' -ngl 0' : ' -ngl 99';
    const tabs = [];
    const big = p.w > 48;
    const be = backend(hw), vk = be.api === 'vulkan' || be.api === 'override';
    const vkOllama = vk ? `# No ROCm on this card: run Ollama on Vulkan (OLLAMA_VULKAN=1 turns it on where it's still opt-in)${be.api === 'override' ? '\n# Linux alternative: HSA_OVERRIDE_GFX_VERSION=10.3.0 ollama serve  (ROCm, a bit faster)' : ''}\nOLLAMA_VULKAN=1 ` : '';
    if (m.g) {
      const ref = `${m.g}${tag ? `:${tag}` : ''}`;
      tabs.push(['ollama', 'Ollama', `${big ? '# Large split model: llama.cpp handles multi-file GGUFs more reliably.\n' : ''}${kvf < 1 || ctx > 4096 || vk ? `# set once, then restart Ollama\n${vkOllama}OLLAMA_CONTEXT_LENGTH=${ctx} OLLAMA_FLASH_ATTENTION=1${kvf < 1 ? ` OLLAMA_KV_CACHE_TYPE=${kvf < 0.5 ? 'q4_0' : 'q8_0'}` : ''} ollama serve\n\n` : ''}ollama run hf.co/${ref}\n\n# OpenAI-compatible API: http://localhost:11434/v1`]);
      tabs.push(['llama', 'llama.cpp', `${vk ? '# Download the Vulkan build (…-bin-win-vulkan-x64.zip / ubuntu-vulkan) from GitHub releases\n' : ''}llama-server -hf ${ref} -c ${ctx}${ngl}${moe} -fa on${kvFlags} --jinja\n\n# Chat in the browser: http://localhost:8080\n# OpenAI-compatible API: http://localhost:8080/v1`]);
      tabs.push(['lms', 'LM Studio', `${vk ? '# Settings → Runtime: select the Vulkan llama.cpp runtime (ROCm won’t load on this card)\n' : ''}# In the app: Discover → search “${m.g.split('/')[1]}” → pick ${tag || p.q}\n# or from the terminal:\nlms get ${m.g}\nlms load --context-length ${ctx}\nlms server start   # API: http://localhost:1234/v1`]);
    }
    if (m.mlx && (hw.kind === 'apple' || !m.g)) tabs.push(['mlx', 'MLX (Mac)', `pip install -U mlx-lm\nmlx_lm.server --model ${m.mlx}\n\n# Quick test\nmlx_lm.generate --model ${m.mlx} --prompt "Write a haiku about GPUs"`]);
    if (!vk || !tabs.length) tabs.push(['vllm', 'vLLM (server)', `${vk ? '# vLLM needs CUDA or ROCm, so this card can’t run it — shown for reference\n' : ''}# Linux + NVIDIA/AMD, whole model in VRAM (BF16 needs ~${gbs(m.t * 2)}; FP8 ~${gbs(m.t)})\npip install -U vllm\nvllm serve ${m.hf} --max-model-len ${ctx}${m.t * 2 > (hw.vram || 0) && m.t * 2 > 80 ? ` --tensor-parallel-size ${Math.min(8, 2 ** Math.ceil(Math.log2(m.t * 2.2 / 80)))}` : ''}${m.tools ? ' --enable-auto-tool-choice --tool-call-parser hermes' : ''}`]);
    if (!tabs.find((t) => t[0] === tab)) tab = tabs[0][0];
    els.tabs.innerHTML = tabs.map(([k, l]) => `<button type="button" role="tab" aria-selected="${k === tab}" data-k="${k}">${l}</button>`).join('');
    const t = tabs.find((x) => x[0] === tab);
    els.cmd.innerHTML = `<pre class="lc-code" tabindex="0"><code>${esc(t[2])}</code><button type="button" class="lc-copy" aria-label="Copy">Copy</button></pre>${!m.g ? '<p class="muted small">No community GGUF build found yet — use the original weights with vLLM, or check Hugging Face for new conversions.</p>' : !tag ? `<p class="muted small">This GGUF repo doesn’t publish a ${p.q} file; the command pulls its default. Pick a quantization it ships: ${esc((m.q || []).slice(0, 8).join(', '))}.</p>` : ''}${t[0] === 'vllm' && m.tools ? '<p class="muted small">The right <code>--tool-call-parser</code> depends on the model family; check its model card.</p>' : ''}`;
  }

  // ── Wiring ───────────────────────────────────────────────
  let timer = 0;
  const run = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const hw = read(); save('lc-hw', hw);
      const ok = results(hw); upgrades(hw, ok); inspect(hw);
    }, 30);
  };
  const applyGpu = () => {
    const [, v, b] = gpuRow();
    if (unifiedKind(els.kind.value)) { els.ram.value = v; els.bw.value = b; }
    else if (els.kind.value === 'cpu') { els.vram.value = 0; els.bw.value = els.ramtype.value; }
    else { els.vram.value = v; els.bw.value = b; }
  };
  els.kind.addEventListener('change', () => { fillGpus(); applyGpu(); run(); });
  els.gpu.addEventListener('change', () => { applyGpu(); run(); });
  els.ramtype.addEventListener('change', () => { if (els.kind.value === 'cpu') els.bw.value = els.ramtype.value; run(); });
  [els.vram, els.ram, els.bw].forEach((e) => e.addEventListener('input', run));
  [els.ctx, els.use, els.model, els.quant, els.kv].forEach((e) => e.addEventListener('change', run));
  const show = (id, q) => {
    els.model.value = id; if (q) els.quant.value = q;
    run(); $('#lc-insp').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.lc-row, .lc-pickcard, .lc-pick');
    if (b) return show(b.dataset.id, b.dataset.q);
    const t = e.target.closest('#lc-tabs button');
    if (t) { tab = t.dataset.k; save('lc-tab', tab); return inspect(read()); }
    const c = e.target.closest('.lc-copy');
    if (c) {
      const text = c.parentElement.querySelector('code').textContent;
      navigator.clipboard?.writeText(text).then(() => { c.textContent = 'Copied'; setTimeout(() => { c.textContent = 'Copy'; }, 1400); }).catch(() => {});
    }
  });

  (async () => {
    const info = await detect();
    const g = guess(info);
    const said = [];
    if (info.renderer || info.gpuDesc) said.push(`GPU: <b>${esc((info.gpuDesc || info.renderer).replace(/^ANGLE \((.*)\)$/, '$1').replace(/^(NVIDIA|AMD|Intel|Apple|Google Inc\.[^,]*), /i, '').replace(/\(0x[0-9a-f]+\)|Direct3D.*|vs_\d.*|OpenGL.*$/gi, '').replace(/,\s*$/, '').slice(0, 80))}</b>`);
    if (info.cores) said.push(`${info.cores} CPU threads`);
    if (info.mem) said.push(`RAM: ${info.mem >= 8 ? 'at least 8 GB (browsers cap this figure)' : `about ${info.mem} GB`}`);
    if (info.platform) said.push(info.platform + (info.arch ? ` · ${info.arch}` : ''));
    if (!S) {
      els.kind.value = g.kind; fillGpus(); els.gpu.value = g.name; applyGpu();
      if (!unifiedKind(g.kind)) els.ram.value = info.mem && info.mem < 8 ? info.mem : 16;
      if (g.kind === 'cpu') els.bw.value = els.ramtype.value;
      S = read();
    }
    write(S);
    els.detect.innerHTML = `${said.length ? `Detected ${said.join(' · ')}. ` : 'Your browser hides its hardware details. '}${S === null ? '' : ''}<span>Matched to <b>${esc(els.gpu.value)}</b> — correct anything below; it's saved on this device.</span>`;
    const fromHash = decodeURIComponent(location.hash.slice(1));
    if (MODELS.some((m) => m.id === fromHash)) els.model.value = fromHash;
    run();
  })();
})();
