// Benchmark scores for the Models page, from Epoch AI's public benchmarking hub
// (https://epoch.ai/benchmarks — free under CC BY 4.0). One zip of CSVs; each row is a model
// version (often with a reasoning-effort suffix) and its score. We keep the best score per model.

import { inflateRawSync } from 'node:zlib';

const ZIP = 'https://epoch.ai/data/benchmark_data.zip';
export const BENCH_SOURCE = { name: 'Epoch AI', url: 'https://epoch.ai/benchmarks' };

// Coding first, then reasoning, science and maths. unit: 'pct' (0–1 → %) or 'min' (minutes).
export const BENCHMARKS = [
  { id: 'fswe', name: 'FrontierSWE', desc: 'Long, open-ended software engineering projects', file: 'frontierswe_external.csv', col: 'Score', unit: 'pct' },
  { id: 'dswe', name: 'DeepSWE', desc: 'Hard multi-file coding tasks, pass@1', file: 'deepswe_external.csv', col: 'Pass@1', unit: 'pct' },
  { id: 'swe', name: 'SWE-bench Verified', desc: 'Real GitHub issues fixed in Python repos', file: 'swe_bench_verified.csv', col: 'mean_score', unit: 'pct' },
  { id: 'tb', name: 'Terminal-Bench', desc: 'Agentic tasks in a real terminal (best agent)', file: 'terminalbench_external.csv', col: 'Accuracy mean', unit: 'pct' },
  { id: 'metr', name: 'METR time horizon', desc: 'Length of software task solved 50% of the time', file: 'metr_time_horizons_external.csv', col: 'Time horizon', unit: 'min' },
  { id: 'gpqa', name: 'GPQA Diamond', desc: 'PhD-level science questions', file: 'gpqa_diamond.csv', col: 'mean_score', unit: 'pct' },
  { id: 'hle', name: "Humanity's Last Exam", desc: 'Expert questions across many fields', file: 'hle_external.csv', col: 'Accuracy', unit: 'pct' },
  { id: 'arc2', name: 'ARC-AGI-2', desc: 'Abstract visual reasoning puzzles', file: 'arc_agi_2_external.csv', col: 'Score', unit: 'pct' },
  { id: 'fm', name: 'FrontierMath', desc: 'Research-level maths problems (tiers 1–3)', file: 'frontiermath_tiers_1_3_v2.csv', col: 'mean_score', unit: 'pct' },
];

// "gpt-5.4-2026-03-05_high" and "openai/gpt-5.4" → "gpt-5-4": drop effort suffix, date stamps, preview tags.
export const benchKey = (id) => id.toLowerCase().split('/').pop()
  .replace(/_[^_]*$/, '').replace(/-(\d{4}-?\d{2}-?\d{2}|\d{4})$/, '').replace(/-(preview|exp|latest)$/, '').replace(/\./g, '-');

// Minimal reader for the zip's central directory (stored or deflated entries).
function unzip(buf) {
  const files = {};
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('not a zip');
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = buf.readUInt16LE(eocd + 10); n--;) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen).split('/').pop();
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    files[name] = (method === 8 ? inflateRawSync(raw) : raw).toString('utf8');
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

function parseCsv(text) {
  const rows = [];
  let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((k, i) => [k, r[i]])));
}

// → { benchKey: { swe: 0.787, metr: 718.8, … } }, best score per model across efforts and agents.
async function download(attempt = 1) {
  try {
    const res = await fetch(ZIP, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`${res.status} ${ZIP}`);
    return Buffer.from(await res.arrayBuffer());
  } catch (e) {
    if (attempt >= 3) throw e;
    await new Promise((r) => setTimeout(r, 2000 * attempt));
    return download(attempt + 1);
  }
}

export async function fetchBenchmarks() {
  const files = unzip(await download());
  const scores = {};
  for (const b of BENCHMARKS) {
    if (!files[b.file]) throw new Error(`missing ${b.file}`);
    for (const r of parseCsv(files[b.file])) {
      const v = Number(r[b.col]);
      if (!r['Model version'] || !Number.isFinite(v) || (b.where && !b.where(r))) continue;
      const s = (scores[benchKey(r['Model version'])] ||= {});
      if (!(s[b.id] >= v)) s[b.id] = Math.round(v * 1e4) / 1e4;
    }
  }
  return scores;
}
