// Validate the built site, not just the templates. Run after npm run build.
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { TOOL_TOPICS, topicPath } from './seo.mjs';

const dist = new URL('../dist/', import.meta.url);
const base = (process.env.SITE_URL || 'https://aiticker.site').replace(/\/$/, '');
const read = (path) => readFile(new URL(path, dist), 'utf8');
const sitemap = await read('sitemap.xml');
assert.equal(XMLValidator.validate(sitemap), true, 'sitemap must be valid XML');
const entries = new XMLParser().parse(sitemap).urlset.url;
const urls = [].concat(entries).map((entry) => entry.loc);
assert.equal(new Set(urls).size, urls.length, 'sitemap URLs must be unique');
const fileFor = (url) => {
  const parsed = new URL(url);
  assert.equal(parsed.origin, new URL(base).origin, 'sitemap must use the configured domain');
  const path = decodeURIComponent(parsed.pathname).slice(1);
  assert.ok(!path.split('/').includes('..'));
  return path.endsWith('/') || !path ? `${path}index.html` : path;
};
const canonical = (html) => [...html.matchAll(/<link\s+rel="canonical"\s+href="([^"]+)"/g)].map((m) => m[1]);
const robots = (html) => [...html.matchAll(/<meta\s+name="robots"\s+content="([^"]+)"/g)].map((m) => m[1]);

for (let i = 0; i < urls.length; i += 40) {
  await Promise.all(urls.slice(i, i + 40).map(async (url) => {
    const html = await read(fileFor(url));
    assert.deepEqual(canonical(html), [url], `self-canonical required: ${url}`);
    const directives = robots(html);
    assert.equal(directives.length, 1, `one robots directive: ${url}`);
    assert.ok(!directives.some((text) => /\bnoindex\b/i.test(text)), `noindex URL in sitemap: ${url}`);
    assert.match(html, /<title>[^<]+<\/title>/, `title required: ${url}`);
    assert.match(html, /<meta name="description" content="[^"]+">/, `description required: ${url}`);
    for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(match[1]);
  }));
}

const home = await read('index.html');
assert.match(home, /<h1>AI coding tool news /);
assert.match(home, /id="tracking-method"/);
const titles = new Set();
const search = JSON.parse(await read('search.json')).items;
const tools = JSON.parse(await read('data.json')).tools;
let topicCount = 0;
for (const category of Object.keys(TOOL_TOPICS)) {
  if (!tools.some((tool) => tool.category === category)) continue;
  const path = topicPath(category), html = await read(`${path}index.html`);
  assert.ok(urls.includes(`${base}/${path}`), `topic in sitemap: ${path}`);
  assert.ok(home.includes(`href="${path}"`), `topic linked from home: ${path}`);
  assert.ok(search.some((item) => item.u === path), `topic in site search: ${path}`);
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  const topicNav = html.match(/<nav class="topic-links"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(topicNav?.includes(`href="../../${path}" aria-current="page"`), `current topic anchor: ${path}`);
  const title = html.match(/<title>(.*?)<\/title>/)[1];
  assert.ok(!titles.has(title), 'topic titles must be unique');
  titles.add(title);
  for (const match of html.matchAll(/<a\b[^>]*href="([^"]+)"/g)) {
    const url = new URL(match[1].replace(/&amp;/g, '&'), `${base}/${path}`);
    if (url.origin === new URL(base).origin) await stat(new URL(fileFor(url.href), dist));
  }
  topicCount++;
}
assert.ok(robots(await read('offline.html'))[0].includes('noindex'));
assert.equal(robots(await read('offline.html')).length, 1);
assert.doesNotMatch(await read('assets/app.js'), /classList\.add\(['"]adwalled/);
assert.doesNotMatch(await read('assets/styles.css'), /\.adwalled/);
// Company availability and mix change with the upstream catalog; do not require a fixed vendor.
for (const company of search.filter((item) => item.t === 'company')) {
  const html = await read(`${company.u}index.html`);
  assert.ok(/<h1>[^]*?<em>AI (?:models|tools &amp; models|coding tools)<\/em><\/h1>/.test(html), `AI-product heading required: ${company.u}`);
  assert.doesNotMatch(html.match(/<meta name="description"[^>]+>/)[0], /founded|HKEX/i);
}
console.log(`SEO checks passed: ${urls.length} sitemap URLs, ${topicCount} topic hubs, metadata, structured data, links and nonblocking ad notice.`);
