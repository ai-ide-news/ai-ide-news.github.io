// Always-on release watcher (runs as a long GitHub Actions job, see .github/workflows/watch.yml).
// Every CHECK_SECONDS it runs the cheap QUICK fetch (ETag requests: unchanged GitHub repos are
// free). The moment something new ships it fires a repository_dispatch "refresh", which makes the
// deploy workflow rebuild and publish the site — ~1 minute detection instead of waiting for cron.
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const SNAPSHOT = new URL('../data/snapshot.json', import.meta.url);
const CHECK_SECONDS = Number(process.env.CHECK_SECONDS || 60);
const RUN_MINUTES = Number(process.env.RUN_MINUTES || 340); // Actions jobs max out at 6h
const REPO = process.env.GITHUB_REPOSITORY;
const TOKEN = process.env.GITHUB_TOKEN;
const started = Date.now();

const generatedAt = async () => JSON.parse(await readFile(SNAPSHOT, 'utf8')).generatedAt;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const git = (...args) => spawnSync('git', args, { encoding: 'utf8' });

// Pick up snapshots committed by deploy runs, so we compare against what's live, not a stale copy.
async function syncSnapshot() {
  if (git('fetch', '-q', 'origin', 'main').status !== 0) return;
  const remote = git('show', 'origin/main:data/snapshot.json');
  if (remote.status !== 0) return;
  try {
    if (JSON.parse(remote.stdout).generatedAt > await generatedAt()) git('checkout', 'origin/main', '--', 'data/snapshot.json');
  } catch {}
}

// Returns true once the deploy is triggered. Network errors are caught so a transient blip
// (e.g. a connect timeout to api.github.com) doesn't kill the whole watcher shift.
async function dispatch() {
  if (!REPO || !TOKEN) return console.log('  (no GITHUB_REPOSITORY/GITHUB_TOKEN — not dispatching)'), true;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/dispatches`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'patchwire-watcher' },
      body: JSON.stringify({ event_type: 'refresh' }),
      signal: AbortSignal.timeout(30e3),
    });
    console.log(res.ok ? '  → deploy triggered' : `  ✗ dispatch failed: ${res.status} ${await res.text()}`);
    return res.ok;
  } catch (err) {
    console.log(`  ✗ dispatch failed: ${err.cause?.code || err.name}: ${err.cause?.message || err.message} — retrying next check`);
    return false;
  }
}

let pending = false; // a change was detected but its dispatch hasn't succeeded yet
while (Date.now() - started < RUN_MINUTES * 60e3) {
  const t0 = Date.now();
  await syncSnapshot();
  const before = await generatedAt();
  const run = spawnSync(process.execPath, [fileURLToPath(new URL('./fetch.mjs', import.meta.url))], {
    env: { ...process.env, QUICK: '1', GITHUB_OUTPUT: '' }, encoding: 'utf8',
  });
  const changed = (await generatedAt()) !== before; // QUICK runs only rewrite the snapshot when something shipped
  const line = (run.stdout || '').split('\n').find((l) => /^[★·] /.test(l)) || run.stderr?.trim().split('\n').pop();
  console.log(`${new Date().toISOString()} ${line || ''}`);
  if (changed || pending) pending = !(await dispatch());
  await sleep(Math.max(5e3, CHECK_SECONDS * 1e3 - (Date.now() - t0)));
}
console.log('Watcher shift over; the next scheduled run takes over.');
