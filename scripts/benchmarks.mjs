// Benchmark scores for the Models page, from Epoch AI's public benchmarking hub
// (https://epoch.ai/benchmarks — free under CC BY 4.0). One zip of CSVs; each row is a model
// version (often with a reasoning-effort suffix) and its score. We keep the best score per model.

import { inflateRawSync } from 'node:zlib';

const ZIP = 'https://epoch.ai/data/benchmark_data.zip';
export const BENCH_SOURCE = { name: 'Epoch AI', url: 'https://epoch.ai/benchmarks' };

// Every benchmark the site shows, grouped by what it measures. Descriptions follow Epoch's benchmark registry.
// col: the CSV's score column; scale: multiplier applied to it (so 'pct' values end up 0–1).
// unit: 'pct' (0–1 → %), 'min' (minutes), 'elo' (arena rating), 'usd' (dollars), 'of10' (0–10 rubric).
const B = (id, name, desc, file, col, unit = 'pct', scale = 1) => ({ id, name, desc, file, col, unit, scale });
const BEST = 'Best score (across scorers)';
export const BENCHMARKS = [
  // Software engineering
  B('fswe', 'FrontierSWE', 'Ultra-long-horizon engineering tasks with a 20-hour budget each', 'frontierswe_external.csv', 'Score'),
  B('dswe', 'DeepSWE', 'Original long-horizon tasks across active open-source repos', 'deepswe_external.csv', 'Pass@1'),
  B('cursor', 'CursorBench', 'Ambiguous multi-file tasks drawn from real Cursor sessions', 'cursorbench_external.csv', 'Score'),
  B('fcode', 'FrontierCode', 'Mergeable fixes for hard open-source issues', 'frontiercode_external.csv', 'Main score'),
  B('swe', 'SWE-bench Verified', 'Real GitHub issues fixed in Python repos', 'swe_bench_verified.csv', BEST),
  B('tb', 'Terminal-Bench', 'Tasks completed with the programs in a real terminal (best agent)', 'terminalbench_external.csv', 'Accuracy mean'),
  B('mirror', 'MirrorCode', 'Reimplement whole programs end-to-end without the source', 'mirrorcode.csv', BEST),
  B('gba', 'GBAEval', 'Build a Game Boy Advance emulator from scratch', 'gbaeval_external.csv', 'Overall score'),
  B('gso', 'GSO', 'Optimize real code to make it significantly faster', 'gso_external.csv', 'Score OPT@1'),
  B('scicode', 'SciCode', 'Research-coding problems from the natural sciences', 'scicode_external.csv', 'Score'),
  B('aider', 'Aider Polyglot', 'Hard Exercism problems in many languages', 'aider_polyglot_external.csv', 'Percent correct', 'pct', 0.01),
  B('weirdml', 'WeirdML v3', 'Unfamiliar ML and data tasks with vague goals', 'weirdml_v3_external.csv', 'Score'),
  B('metr', 'METR time horizon', 'Length of software task solved more often than not', 'metr_time_horizons_external.csv', 'Time horizon', 'min'),
  // Agents & computer use
  B('apex', 'APEX-Agents', 'Long professional tasks in banking, consulting and law', 'apex_agents_external.csv', 'Pass@1 score'),
  B('rli', 'Remote Labor Index', 'Real paid freelance projects done end-to-end', 'rli_external.csv', 'Score'),
  B('osw2', 'OSWorld 2.0', 'Long real-world desktop and web tasks', 'osworld_2_external.csv', 'Binary accuracy'),
  B('osw', 'OSWorld', 'Desktop and web tasks with keyboard and mouse', 'os_world_external.csv', 'Score', 'pct', 0.01),
  B('gdpval', 'GDPval', 'Real-world occupational tasks, win rate vs experts', 'gdpval_external.csv', 'Win Rate (%)'),
  B('vend', 'Vending-Bench 2', 'Run a simulated vending business for a year (final balance)', 'vending_bench_2_external.csv', 'Score', 'usd'),
  B('ptb', 'PostTrainBench', 'Post-train small models under a fixed compute budget', 'posttrainbench_external.csv', 'Average (%)'),
  // Writing & content
  B('write', 'Lech Mazur Writing', 'Short stories weaving 10 required elements, judged 0–10', 'lech_mazur_writing_external.csv', 'Mean score', 'of10'),
  B('fiction', 'Fiction.LiveBench', 'Understanding long creative writing (16k tokens)', 'fictionlivebench_external.csv', '16k token score'),
  B('dr', 'DeepResearch Bench', 'Find and synthesize information from the web', 'deepresearchbench_external.csv', 'Average score'),
  B('gdppdf', 'GDP.pdf', 'Answer questions about real professional PDFs', 'gdp_pdf_external.csv', 'GDP.pdf score'),
  B('sqa', 'SimpleQA Verified', 'Factual accuracy on 1,000 short questions', 'simpleqa_verified.csv', BEST),
  // Design, visual & spatial
  B('webdev', 'WebDev Arena', 'People vote on which model builds the better website (Elo)', 'webdev_arena_external.csv', 'Arena Score', 'elo'),
  B('blueprint', 'Blueprint-Bench 2', 'Turn apartment photos into 2D floor plans', 'blueprint_bench_2_external.csv', 'Score'),
  B('furniture', 'Furniture Assembly', 'Spot mistakes in photos of IKEA builds', 'furniture_assembly.csv', BEST),
  B('vpct', 'VPCT', 'Read diagrams of balls rolling down ramps', 'vpct_external.csv', 'Correct'),
  B('spatial', 'SpatialViz-Bench', 'Mental rotation, folding and other spatial puzzles', 'spatialviz_bench_external.csv', 'Overall score'),
  B('geo', 'GeoBench', 'Guess the country a photo was taken in', 'geobench_external.csv', 'ACW Country %'),
  // Cybersecurity
  B('cybench', 'Cybench', 'Find and exploit vulnerabilities in sandboxed challenges', 'cybench_external.csv', 'Unguided % Solved'),
  B('exploit', 'ExploitBench', 'Exploit real, hardened security vulnerabilities', 'exploitbench_external.csv', 'Mean capability'),
  // Reasoning & knowledge
  B('gpqa', 'GPQA Diamond', 'PhD-level biology, chemistry and physics questions', 'gpqa_diamond.csv', BEST),
  B('hle', "Humanity's Last Exam", 'Expert questions across 100+ subjects', 'hle_external.csv', 'Accuracy'),
  B('arc2', 'ARC-AGI-2', 'Few-shot abstract reasoning on grid puzzles', 'arc_agi_2_external.csv', 'Score'),
  B('arc1', 'ARC-AGI-1', 'Pattern induction from input–output examples', 'arc_agi_external.csv', 'Score'),
  B('simple', 'SimpleBench', 'Common-sense trick questions about space, time and people', 'simplebench_external.csv', 'Score (AVG@5)'),
  B('critpt', 'CritPt', 'Open-ended, research-level physics problems', 'critpt_external.csv', 'Accuracy'),
  B('chess', 'Chess Puzzles', 'Find the single best move in 100 new puzzles', 'chess_puzzles.csv', BEST),
  B('lmca', 'LMCA', 'Judge the quality of conceptual arguments like experts', 'lmca_external.csv', 'Score', 'pct', 0.01),
  // Maths
  B('fm', 'FrontierMath', 'Expert-written problems, undergrad to early research (tiers 1–3)', 'frontiermath_tiers_1_3_v2.csv', BEST),
  B('fm4', 'FrontierMath Tier 4', 'Exceptionally hard research-level problems', 'frontiermath_tier_4_v2.csv', BEST),
  B('proof', 'ProofBench', 'Graduate maths proofs verified in Lean 4', 'proofbench_external.csv', 'Accuracy'),
  B('aime', 'OTIS Mock AIME', 'Competition-style problems harder than MATH Level 5', 'otis_mock_aime_2024_2025.csv', BEST),
];

// Each benchmark's group is set from the first benchmark listed under it above.
const GROUP_STARTS = { fswe: 'Software engineering', apex: 'Agents & computer use', write: 'Writing & content', webdev: 'Design & visual', cybench: 'Cybersecurity', gpqa: 'Reasoning & knowledge', fm: 'Maths' };
let group;
for (const b of BENCHMARKS) b.group = group = GROUP_STARTS[b.id] || group;

// Ready-made sets for the showdown; the first is the default view.
export const BENCH_SETS = [
  { id: 'overview', name: 'Overview', ids: ['fswe', 'dswe', 'swe', 'tb', 'webdev', 'gpqa', 'hle', 'arc2', 'fm'] },
  { id: 'coding', name: 'Coding', ids: ['fswe', 'dswe', 'cursor', 'fcode', 'swe', 'tb', 'mirror', 'gba', 'gso', 'scicode', 'aider', 'webdev', 'metr'] },
  { id: 'agents', name: 'Agents & computer use', ids: ['apex', 'rli', 'osw2', 'osw', 'gdpval', 'vend', 'ptb', 'tb', 'metr'] },
  { id: 'writing', name: 'Writing & content', ids: ['write', 'fiction', 'dr', 'gdppdf', 'sqa', 'gdpval'] },
  { id: 'design', name: 'Design & visual', ids: ['webdev', 'blueprint', 'furniture', 'vpct', 'spatial', 'geo'] },
  { id: 'security', name: 'Cybersecurity', ids: ['cybench', 'exploit', 'tb'] },
  { id: 'reasoning', name: 'Reasoning & knowledge', ids: ['gpqa', 'hle', 'arc2', 'arc1', 'simple', 'critpt', 'sqa', 'chess', 'lmca'] },
  { id: 'math', name: 'Maths', ids: ['fm', 'fm4', 'proof', 'aime'] },
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
  const scores = {}, missing = [];
  for (const b of BENCHMARKS) {
    // A benchmark Epoch drops or renames is skipped rather than failing the whole refresh.
    if (!files[b.file]) { missing.push(b.file); continue; }
    for (const r of parseCsv(files[b.file])) {
      const v = Number(r[b.col]) * b.scale;
      if (!r['Model version'] || r[b.col] === '' || !Number.isFinite(v)) continue;
      const s = (scores[benchKey(r['Model version'])] ||= {});
      if (!(s[b.id] >= v)) s[b.id] = Math.round(v * 1e4) / 1e4;
    }
  }
  if (missing.length === BENCHMARKS.length) throw new Error('no benchmark files found');
  return { scores, missing };
}
