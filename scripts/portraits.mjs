// Resolves a photo per founder and a logo per shareholder for the company pages, cached in data/portraits/.
// People: Wikipedia page (searched with the company as context, must be a human on Wikidata) → its Commons
// photo, credited · else a GitHub avatar whose profile name matches. Organisations: Wikidata logo → the
// website's own icon. Anything unresolved renders as initials.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { image, siteIcon } from './icons.mjs';

const VERSION = 1; // bump to re-resolve everything
const UA = 'aiticker/1.0 (https://github.com/ai-ide-news; site build bot)';
const WP = 'https://en.wikipedia.org/w/api.php';
const GH_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

// Display names that need a hint to find the right page or site.
const WIKI = {
  Alibaba: 'Alibaba Group', 'Alibaba Group': 'Alibaba Group', SoftBank: 'SoftBank Group', a16z: 'Andreessen Horowitz', Sequoia: 'Sequoia Capital',
  Lightspeed: 'Lightspeed Venture Partners', Fidelity: 'Fidelity Investments', GIC: 'GIC Private Limited', Vanguard: 'The Vanguard Group',
  'Kingdom Holding': 'Kingdom Holding Company', ASML: 'ASML Holding', KKR: 'KKR & Co.', SIG: 'Susquehanna International Group',
  Oracle: 'Oracle Corporation', 'Tsinghua-affiliated entities': 'Tsinghua University', 'OpenAI Foundation': 'OpenAI',
  'PSP Investments': 'Public Sector Pension Investment Board', GV: 'GV (company)', 'IDG Capital': 'IDG Capital',
  'Qatar Investment Authority': 'Qatar Investment Authority', 'AMD Ventures': 'AMD', Bpifrance: 'Bpifrance', Naspers: 'Naspers', Accel: 'Accel (venture capital firm)', 'High-Flyer': 'High-Flyer', 'Y Combinator': 'Y Combinator',
};
const SITE = {
  'OpenAI Startup Fund': 'https://openai.com', 'OpenAI Foundation': 'https://openai.com', Heavybit: 'https://www.heavybit.com', 'Radical Ventures': 'https://radical.vc',
  'Innovation Endeavors': 'https://www.innovationendeavors.com', 'Qiming Venture Partners': 'https://www.qimingvc.com', HongShan: 'https://www.hongshan.com',
  MGX: 'https://www.mgx.ae', 'Valor Equity Partners': 'https://www.valorep.com', Inovia: 'https://www.inovia.vc', Hillhouse: 'https://www.hillhouseinvestment.com',
  Prosperity7: 'https://prosperity7vc.com', 'Salesforce Ventures': 'https://salesforceventures.com', '8VC': 'https://8vc.com',
  'Lux Capital': 'https://www.luxcapital.com', 'Sutter Hill Ventures': 'https://www.shv.com', 'Thrive Capital': 'https://thrivecap.com', 'Spark Capital': 'https://www.sparkcapital.com',
  'Menlo Ventures': 'https://menlovc.com', ICONIQ: 'https://www.iconiqcapital.com', Redpoint: 'https://www.redpoint.com', 
  'General Catalyst': 'https://www.generalcatalyst.com', 'Index Ventures': 'https://www.indexventures.com', 'Founders Fund': 'https://foundersfund.com',
  'Khosla Ventures': 'https://www.khoslaventures.com', 'General Atlantic': 'https://www.generalatlantic.com', miHoYo: 'https://www.mihoyo.com',
};
// GitHub accounts for builders without a usable Wikipedia photo (still checked against the profile's name).
const GITHUB = {
  'Chris Wanstrath': 'defunkt', 'Tom Preston-Werner': 'mojombo', 'Scott Chacon': 'schacon', 'PJ Hyett': 'pjhyett', 'Sid Sijbrandij': 'sytses',
  'Nathan Sobo': 'nathansobo', 'Antonio Scandurra': 'as-cii', 'Max Brunsfeld': 'maxbrunsfeld', 'Graham Neubig': 'neubig', 'Xingyao Wang': 'xingyaoww',
  'Robert Brennan': 'rbren', 'Nate Sesti': 'sestinj', 'Ty Dunn': 'TyDunn', 'Chris Olah': 'colah', 'Zach Lloyd': 'zachlloyd',
  'Wojciech Zaremba': 'wojzaremba', 'John Schulman': 'joschu', 'Greg Yang': 'thegregyang', 'Guillaume Lample': 'glample',
};

// Sources that resolve but come out blank (white-on-white logos, empty avatars): show initials instead.
const SKIP = new Set(['Nate Sesti', 'Sutter Hill Ventures', 'Menlo Ventures']);

/** Splits a display label ("Microsoft (~27%)", "Larry Page & Sergey Brin (…)") into the names to picture. */
export const subjects = (label) => label.replace(/\s*\(.*?\)\s*/g, ' ').trim()
  .split(/\s+(?:&|\/)\s+/).map((s) => s.trim())
  .filter((s) => s && !/^(and |employees|founders|chinese state|shanghai state)/i.test(s));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Wikimedia rate-limits bursts; back off and retry instead of recording a miss.
const get = async (url, json = true, headers = {}) => {
  for (let i = 0; ; i++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: AbortSignal.timeout(15000) });
    if (res.status === 429 && i < 4) { await sleep(2000 * 2 ** i); continue; }
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return json ? res.json() : res;
  }
};
const wp = (params) => get(`${WP}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`);
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const strip = (html = '') => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

// Wikipedia title → { qid, intro, claims } via Wikidata.
async function entity(title) {
  const r = await wp({ action: 'query', prop: 'pageprops|extracts|pageimages', ppprop: 'wikibase_item', piprop: 'name', pilicense: 'free', exintro: '1', explaintext: '1', exchars: '1200', redirects: '1', titles: title });
  const page = r.query?.pages?.[0];
  const qid = page?.pageprops?.wikibase_item;
  if (!qid) return null;
  const e = (await get(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`)).entities[qid];
  const claim = (p) => (e.claims[p] || []).sort((a, b) => (b.rank === 'preferred') - (a.rank === 'preferred')).map((c) => c.mainsnak.datavalue?.value).filter(Boolean);
  return { qid, intro: fold(page.extract || ''), human: claim('P31').some((v) => v.id === 'Q5'), photo: claim('P18')[0] || page.pageimage, logo: claim('P154')[0], site: claim('P856')[0] };
}

// A Commons file as a 160px raster thumbnail plus its credit line.
async function commons(file) {
  const r = await wp({ action: 'query', prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '160', titles: `File:${file}` });
  const ii = r.query?.pages?.[0]?.imageinfo?.[0];
  const img = ii?.thumburl && await image(ii.thumburl);
  if (!img) return null;
  const m = ii.extmetadata || {};
  const credit = [strip(m.Artist?.value), m.LicenseShortName?.value].filter(Boolean).join(' · ');
  return { ...img, src: ii.descriptionurl, credit: credit ? `${credit} (Wikimedia Commons)` : 'Wikimedia Commons' };
}

// The page must be about someone in this world, not a namesake (a footballer called Jack Clark).
const RELEVANT = /artificial intelligence|machine learning|software|computer|programmer|entrepreneur|business(man|woman)|billionaire|investor|technology|internet|executive|founder/;

async function wikiPerson(name, ctx) {
  const tokens = fold(name).split(/[\s-]+/);
  const titles = (await wp({ action: 'query', list: 'search', srsearch: `${name} ${ctx}`, srlimit: '4' })).query.search
    .map((h) => h.title).filter((t) => tokens.every((x) => fold(t).includes(x)));
  const found = [await entity(name)];
  for (const t of titles) found.push(await entity(t));
  const people = found.filter((e) => e?.human);
  // Prefer a page that names the company; else one about someone in tech or business.
  const e = (ctx && people.find((p) => p.intro.includes(fold(ctx)))) || people.find((p) => RELEVANT.test(p.intro));
  return e?.photo ? commons(e.photo) : null; // null too when it's the right person with no free photo
}

async function githubPerson(name) {
  const login = GITHUB[name];
  if (!login) return null;
  try {
    const u = await get(`https://api.github.com/users/${login}`, true, GH_TOKEN ? { Authorization: `Bearer ${GH_TOKEN}` } : {});
    const last = fold(name).split(/\s+/).pop();
    if (!fold(u.name || '').includes(last)) return null;
    const img = await image(`${u.avatar_url}${u.avatar_url.includes('?') ? '&' : '?'}s=160`);
    return img && { ...img, kind: 'photo', src: u.html_url, credit: `GitHub · @${login}` };
  } catch { return null; }
}

export async function org(name) {
  let e = null;
  if (!SITE[name]) {
    const title = WIKI[name] || name;
    const hits = WIKI[name] ? [{ title }] : (await wp({ action: 'query', list: 'search', srsearch: name, srlimit: '3' })).query.search;
    const first = fold(name).split(/\s+/)[0];
    for (const h of hits) {
      if (!WIKI[name] && !fold(h.title).includes(first)) continue;
      e = await entity(h.title);
      if (e) break;
    }
    if (e?.human) return person(name, '');
    if (e?.logo) { const r = await commons(e.logo).catch(() => null); if (r) return { ...r, kind: 'logo' }; }
  }
  const site = SITE[name] || e?.site;
  if (!site) return null;
  const host = new URL(site).hostname;
  const r = await siteIcon(site) || await favicon(host).catch(() => null);
  return r && { ...r, kind: 'logo', src: site, credit: `Logo · ${host.replace(/^www\./, '')}` };
}

// Google's favicon cache, as a last resort; only kept when it is a real ≥32px icon, not the grey globe.
async function favicon(host) {
  const r = await image(`https://www.google.com/s2/favicons?domain=${host}&sz=128`);
  return r?.ext === 'png' && r.buf.readUInt32BE(16) >= 32 ? r : null;
}

export async function person(name, ctx) {
  try { const r = await wikiPerson(name, ctx); if (r) return { ...r, kind: 'photo' }; } catch (err) { console.warn(`portrait ${name}: ${err.message}`); }
  return githubPerson(name);
}

const slug = (s) => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** wanted: [{ name, kind: 'person' | 'any', ctx }] → { [name]: { file, kind: 'photo' | 'logo', credit, src } }. */
export async function resolvePortraits(wanted, cacheDir) {
  await mkdir(cacheDir, { recursive: true });
  const manifestUrl = new URL('manifest.json', cacheDir);
  let manifest = {};
  try { manifest = JSON.parse(await readFile(manifestUrl, 'utf8')); } catch {}
  if (manifest.version !== VERSION) manifest = { version: VERSION, items: {} };

  const seen = new Set();
  const queue = wanted.filter((w) => {
    if (seen.has(w.name)) return false;
    seen.add(w.name);
    const m = manifest.items[w.name];
    return !m || (!m.file && Date.now() - m.checked > 7 * 864e5); // retry misses weekly
  });
  let i = 0;
  await Promise.all(Array.from({ length: 2 }, async () => {
    while (i < queue.length) {
      const w = queue[i++];
      let r = null;
      if (!SKIP.has(w.name)) try { r = w.kind === 'person' ? await person(w.name, w.ctx) : await org(w.name); } catch (err) { console.warn(`portrait ${w.name}: ${err.message}`); }
      const entry = { checked: Date.now(), file: null, kind: null, credit: null, src: null };
      if (r) {
        entry.file = `${slug(w.name)}.${r.ext}`; entry.kind = r.kind; entry.credit = r.credit; entry.src = r.src;
        await writeFile(new URL(entry.file, cacheDir), r.buf);
      }
      manifest.items[w.name] = entry;
    }
  }));
  await writeFile(manifestUrl, JSON.stringify(manifest, null, 1));
  return manifest.items;
}
