// "News" is not every blog post: it's the stories that matter — launches, new models, pricing and
// limit changes, security incidents, acquisitions, policy changes. Candidates come from official
// blogs/changelogs, high-signal Hacker News threads and official X accounts; each one is scored
// and only those above NEWS_MIN make it onto the site.

export const NEWS_MIN = 4; // minimum importance score to count as news
export const NEWS_MAJOR = 6.5; // "major" stories get the headline treatment
const WINDOW_DAYS = 30;
const MAX_NEWS = 60;

// AI labs followed on X in addition to every tool's own account (found by xaccounts.mjs).
export const LAB_ACCOUNTS = [
  'AnthropicAI', 'claudeai', 'OpenAI', 'OpenAIDevs', 'GoogleDeepMind', 'cursor_ai', 'github',
  'code', 'zeddotdev', 'windsurf', 'kirodotdev', 'Alibaba_Qwen', 'Kimi_Moonshot', 'deepseek_ai', 'MistralAI',
];
// Labs and company-wide accounts post plenty of unrelated news (voice, images, ChatGPT features);
// from those we keep only posts about coding or new models for developers.
const LABS = new Set(['anthropicai', 'openai', 'googledeepmind', 'alibaba_qwen', 'kimi_moonshot', 'deepseek_ai', 'mistralai', 'github']);
const CONSUMER = /chatgpt|\bvoice\b|\bimages?\b|\bvideos?\b|\bsora\b|shopping|health|academic|mathematic|music|robot|science|scientific/i;
const DEV = /\b(coding|coder|codex|claude code|code (review|assist|generation)|developers?|api|cli|ide|terminal|repos|repositor(y|ies)|copilot|swe-bench|software engineer(ing|s)?)\b/i;
const MODEL_LAUNCH = /introduc|now available|available (in|via|on|today)|accessible|\bmeet\b|launch|releas|our (latest|newest|new) model/i;
// Judged on the post's opening (its headline), so a passing mention deeper in a thread doesn't count.
const labRelevant = (text) => {
  const head = text.slice(0, 280);
  if (CONSUMER.test(head) && !DEV.test(head)) return false;
  return DEV.test(head) || (SIGNALS.find(([n]) => n === 'Model')[2].test(head) && MODEL_LAUNCH.test(head));
};

// Extra feeds read only for news (must also look relevant to AI coding). press: independent coverage, not an
// official announcement, so it gets no "official" boost. scrape: index-page pattern for sites without RSS (see fetch.mjs).
const CODING = /\b(cod(e|es|ing|er|ers)|developers?|programming|software engineer\w*|ide|cli|agents?|agentic|codex|claude code|copilot|cursor|windsurf|devin|vibe.?cod\w*|open.?weights?|open.?source (ai )?models?)\b/i;
export const NEWS_FEEDS = [
  { url: 'https://openai.com/news/rss.xml', relevant: /codex|coding|developer|agent|\bapi\b|gpt-?\d/i },
  { url: 'https://github.blog/feed/', relevant: /copilot|agent|\bai\b|model/i },
  { url: 'https://blog.google/technology/developers/rss/', relevant: /gemini|jules|antigravity|code assist|agent/i },
  {
    url: 'https://www.anthropic.com/news', relevant: /claude|\bcod(e|ing)\b|developer|agent|\bapi\b|opus|sonnet|haiku|fable|model/i,
    scrape: /<a [^>]*href="(?<url>\/news\/[a-z0-9-]+)"[^>]*><span[^>]*><span[^>]*><h3[^>]*>(?<title>[^<]+)<\/h3>[\s\S]{0,1500}?<time>(?<date>[^<]+)<\/time>/g,
  },
  { url: 'https://mistral.ai/rss.xml', relevant: /cod(e|ing)|codestral|devstral|vibe|developer|agent|\bapi\b|mistral (large|medium|small)|magistral|model/i },
  { url: 'https://deepmind.google/blog/rss.xml', relevant: /gemini \d|coding|developer|agent|antigravity|jules/i },
  { url: 'https://blog.google/technology/ai/rss/', relevant: /gemini \d|coding|developer|agent|antigravity|jules/i },
  { url: 'https://huggingface.co/blog/feed.xml', relevant: CODING },
  { url: 'https://techcrunch.com/category/artificial-intelligence/feed/', press: true, relevant: CODING },
  { url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', press: true, relevant: CODING },
  { url: 'https://the-decoder.com/feed/', press: true, relevant: CODING },
  { url: 'https://www.latent.space/feed', press: true, relevant: CODING },
  { url: 'https://simonwillison.net/atom/everything/', press: true, relevant: CODING },
];

// [tag, weight, pattern] — the first tag that matches the title (else the body) labels the story.
const SIGNALS = [
  ['Security', 5, /vulnerab|\bcve-\d|breach|hacked|leak(ed|s)?\b|malware|compromis|exfiltrat|security (incident|advisory)|supply.chain|backdoor|silently upload|credentials/i],
  ['Business', 5, /acqui(re|res|red|sition)|\braises? (\$|€|£|\d|series|seed)|funding round|valuation|merg(e|er)s? with|joins (forces|openai|anthropic|google)|shut(s|ting)? down|wind(s|ing) down/i],
  ['Deprecation', 4, /end of life|deprecat|retir(e|es|ing|ement)\b|sunset/i],
  ['Model', 2.5, /\b(claude|opus|sonnet|haiku) ?\d|\bgpt-?\d|\bgemini \d|\bo\d\b|\bqwen ?\d|kimi k\d|\bglm-?\d|deepseek[- ]?(v|r)\d|minimax[- ]?m\d|\bllama ?\d|mistral|devstral|codestral|new (coding )?model|open(-| )weights?/i],
  ['Pricing', 4, /pricing|price (cut|drop|increase)|\bfree (tier|for)|rate limits?|usage limits?|\bplans?\b.*(change|new)|\bcredits?\b|billing|charges/i],
  ['Policy', 3, /terms of (service|use)|\btos\b|\bban(s|ned)?\b|suspend|\btelemetry\b|privacy|licen[cs]e change/i],
  ['Outage', 3, /outage|\bdown\b.*(hours|users)|degraded|incident report/i],
  ['Launch', 3, /\bintroduc(ing|es)\b|\bannounc(ing|es|ed)\b|\blaunch(es|ed|ing)?\b|now available|generally available|\bga\b|public (beta|preview)|open.sourc(ed|ing)\b|\bis here\b|\bmeet\b|\b\d+\.0\b|\bv\d+\b(?!\.)/i],
];

// Routine or marketing posts that are never "news", whatever keywords they contain.
const NOISE = /\b(how|why) (\w+ ){0,4}(uses?|cuts?|turns?|halves|boosts?|made|built|increases?|saves?|answers?|moves?|completed|became)\b|case study|customer story|webinar|for beginners|\btips?\b|tutorial|\bhiring\b|podcast|meetup|recap|field notes|challenge|hackathon|giveaway|contest|swag|\bgiving \d+ (people|devs)|getting the most out of|this week'?s|this week in|weekly|newsletter|roundup|developer diary|what is |are you a|^visual studio code \d|^show hn|^ask hn|workflows with|learn and teach|\bguide to\b|best practices|deep dive|govcloud|^(?!introducing|announcing).*\b(with|using) (chatgpt|codex|gpt-?[\d.]*|claude|gemini|copilot)\b/i;

export function scoreNews({ title, text = '', points = 0, likes = 0, official = false, routine = false }) {
  if (NOISE.test(title)) return { score: 0, tag: null };
  const hay = `${title} ${text.slice(0, 400)}`;
  let score = 0, tag = null, bodyTag = null;
  for (const [name, w, re] of SIGNALS) {
    // Title hits count fully; hits only in the body count half.
    if (re.test(title)) { score += w; tag ??= name; } else if (re.test(hay)) { score += w / 2; bodyTag ??= name; }
  }
  tag ??= bodyTag;
  score += points >= 500 ? 4 : points >= 250 ? 3 : points >= 120 ? 2 : points >= 60 ? 1 : 0;
  score += likes >= 5000 ? 3 : likes >= 1000 ? 2 : likes >= 300 ? 1 : 0;
  if (official) score += 1;
  if (routine) score -= 2; // changelog lines are mostly incremental; only big ones should clear the bar
  return { score: Math.round(score * 10) / 10, tag: tag || (points >= 250 ? 'Community' : null) };
}

// ── X ─────────────────────────────────────────────────────
// Read keylessly, the way x.com serves logged-out visitors: the web app's public bearer token plus a
// guest token, then the same GraphQL timeline calls the site makes. No account or API key involved.
// If that ever stops working, X's embed (syndication) timeline is tried instead. Posts accumulate
// across runs, so one failed run never empties the list.
const tweetUrl = (handle, id) => `https://x.com/${handle}/status/${id}`;
const X_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
// Public token embedded in x.com's own JavaScript for logged-out visitors (not a secret).
const WEB_BEARER = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
// GraphQL query ids rotate now and then; each is tried in turn.
const Q_USER = ['xmU6X_CKVnQ5lSrCbAmJsg', 'G3KGOASz96M-Qu0nwmGXNg', 'qW5u-DAuXpMEG0zA1F7UGQ'];
const Q_TWEETS = ['E3opETHurmVJflFsUBVuUQ', 'V7H0Ap3_Hh2FyS75OCDO3Q', 'Y9WM4Id6UcGFE8Z-hbnixw', 'H8OOoI-5ZE4NxgRr8lfyWg'];
const GQL_FEATURES = JSON.stringify(Object.fromEntries([
  'rweb_tipjar_consumption_enabled', 'responsive_web_graphql_exclude_directive_enabled', 'creator_subscriptions_tweet_preview_api_enabled',
  'responsive_web_graphql_timeline_navigation_enabled', 'communities_web_enable_tweet_community_results_fetch', 'c9s_tweet_anatomy_moderator_badge_enabled',
  'articles_preview_enabled', 'responsive_web_edit_tweet_api_enabled', 'graphql_is_translatable_rweb_tweet_is_translatable_enabled',
  'view_counts_everywhere_api_enabled', 'longform_notetweets_consumption_enabled', 'responsive_web_twitter_article_tweet_consumption_enabled',
  'freedom_of_speech_not_reach_fetch_enabled', 'standardized_nudges_misinfo', 'tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled',
  'rweb_video_timestamps_enabled', 'longform_notetweets_rich_text_read_enabled', 'longform_notetweets_inline_media_enabled',
  'hidden_profile_subscriptions_enabled', 'highlights_tweets_tab_ui_enabled', 'subscriptions_verification_info_is_identity_verified_enabled',
  'subscriptions_verification_info_verified_since_enabled', 'responsive_web_twitter_article_notes_tab_enabled', 'subscriptions_feature_can_gift_premium',
].map((k) => [k, true]).concat([
  ['verified_phone_label_enabled', false], ['responsive_web_graphql_skip_user_profile_image_extensions_enabled', false],
  ['tweet_awards_web_tipping_enabled', false], ['creator_subscriptions_quote_tweet_preview_enabled', false], ['responsive_web_enhance_cards_enabled', false],
])));

async function xFetch(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { 'User-Agent': X_UA, ...init.headers }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw Object.assign(new Error(`X ${res.status}`), { status: res.status });
  return res.json();
}

async function gql(ids, op, variables, headers) {
  let err;
  for (const id of ids) {
    try {
      return await xFetch(`https://api.x.com/graphql/${id}/${op}?variables=${encodeURIComponent(JSON.stringify(variables))}&features=${encodeURIComponent(GQL_FEATURES)}`, { headers });
    } catch (e) { err = e; if (e.status === 429) break; }
  }
  throw err;
}

function tweetsIn(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (node.__typename === 'Tweet' && node.legacy && node.rest_id) { out.push(node); return out; }
  for (const v of Object.values(node)) tweetsIn(v, out);
  return out;
}

async function viaGuest(accounts, userIds) {
  const auth = { authorization: `Bearer ${WEB_BEARER}` };
  const activate = async () => ({ ...auth, 'x-guest-token': (await xFetch('https://api.x.com/1.1/guest/activate.json', { method: 'POST', headers: auth })).guest_token });
  let headers = await activate(), renewed = false;
  const posts = [], read = [];
  for (let i = 0; i < accounts.length; i++) { // sequential: gentle on X
    const handle = accounts[i];
    try {
      if (userIds[handle] === null) continue; // no such account
      if (!userIds[handle]) {
        const u = await gql(Q_USER, 'UserByScreenName', { screen_name: handle }, headers);
        userIds[handle] = u.data?.user?.result?.rest_id || null;
        if (!userIds[handle]) continue;
      }
      const j = await gql(Q_TWEETS, 'UserTweets', { userId: userIds[handle], count: 20, includePromotedContent: false, withQuickPromoteEligibilityTweetFields: false, withVoice: false, withV2Timeline: true }, headers);
      for (const t of tweetsIn(j)) {
        const l = t.legacy;
        if (l.retweeted_status_result || l.in_reply_to_status_id_str || l.user_id_str !== userIds[handle]) continue;
        const text = t.note_tweet?.note_tweet_results?.result?.text || l.full_text || '';
        posts.push({ id: t.rest_id, handle, text, date: new Date(l.created_at).toISOString(), likes: l.favorite_count || 0 });
      }
      read.push(handle);
    } catch (e) {
      if (e.status !== 429) continue;
      if (renewed) break; // a fresh guest token was rate-limited too: stop for this run
      headers = await activate(); renewed = true; i--; // retry this account with a new guest token
    }
  }
  if (!read.length) throw new Error('guest timeline unavailable');
  return { posts, read };
}

async function viaSyndication(accounts) {
  const posts = [], read = [];
  for (const handle of accounts) {
    const res = await fetch(`https://syndication.twitter.com/srv/timeline-profile/screen-name/${handle}`, { headers: { 'User-Agent': X_UA }, signal: AbortSignal.timeout(20000) }).catch(() => null);
    if (res?.status === 429) break;
    const json = res?.ok && (await res.text()).match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/s)?.[1];
    if (!json) continue;
    read.push(handle);
    for (const e of JSON.parse(json).props?.pageProps?.timeline?.entries || []) {
      const t = e.content?.tweet;
      if (!t || t.retweeted_status || t.in_reply_to_status_id_str) continue;
      posts.push({ id: t.id_str, handle, text: t.full_text || t.text || '', date: new Date(t.created_at).toISOString(), likes: t.favorite_count || 0 });
    }
  }
  if (!read.length) throw new Error('syndication rate-limited');
  return { posts, read };
}

// `accounts`: handles to read. Least-recently-read go first, so if X rate-limits a run part-way,
// the next run picks up where this one stopped.
export async function fetchX(accounts, prevX = {}, NOW = Date.now()) {
  const userIds = { ...(prevX.userIds || {}) };
  const lastRead = { ...(prevX.lastRead || {}) };
  const order = [...new Set(accounts)].sort((a, b) => (lastRead[a] || '').localeCompare(lastRead[b] || ''));
  let r, via = 'guest';
  try { r = await viaGuest(order, userIds); } catch (e) {
    via = 'syndication';
    try { r = await viaSyndication(order); } catch (e2) { throw new Error(`${e.message}; ${e2.message}`); }
  }
  // Merge with earlier posts (newer like counts win) and drop anything older than the news window.
  const byId = new Map((prevX.posts || []).map((p) => [p.id, p]));
  for (const p of r.posts) byId.set(p.id, p);
  const posts = [...byId.values()].filter((p) => NOW - Date.parse(p.date) < WINDOW_DAYS * 86400e3);
  for (const h of r.read) lastRead[h] = new Date(NOW).toISOString();
  return { posts, userIds, lastRead, via: `${via}, ${r.read.length}/${order.length} accounts`, added: r.posts.length };
}

// X posts the keyless reader misses (for some accounts X serves logged-out readers older popular
// posts, not the latest ones). Each one is always kept as news while it's inside the news window.
export const PINNED_POSTS = [
  { id: '2112220734768779441', handle: 'opencode', date: '2026-10-19T19:34:00.000Z', tag: 'Model',
    text: 'DeepSeek V4.1 Flash updated to 1017 in OpenCode Go and Free\n\nNo changes needed on your end' },
  { id: '2112156205938626954', handle: 'opencode', date: '2026-10-19T15:17:36.000Z', tag: 'Model',
    text: 'Space Bunny was MiniMax M3.1 Flash\n\n#1 on OpenCode for 12 consecutive days, 106T tokens served\n\nNow available on OpenCode, free for the next 3 days' },
];

// ── Selection ─────────────────────────────────────────────
const words = (s) => new Set(s.toLowerCase().replace(/https?:\S+/g, '').match(/[a-z0-9.]{3,}/g) || []);
const similar = (a, b) => {
  if (a.toLowerCase().trim() === b.toLowerCase().trim()) return true;
  const A = words(a), B = words(b);
  const inter = [...A].filter((w) => B.has(w)).length;
  return inter / Math.max(1, Math.min(A.size, B.size)) >= 0.6 && inter >= 3;
};
// Breaches and acquisitions get retold under very different headlines ("X hacked" / "X security breach
// impacted 1.4%"): the same tag about the same single tool within 3 days is one story.
const sameIncident = (a, b) => (a.tag === 'Security' || a.tag === 'Business') && a.tag === b.tag
  && a.toolIds.length === 1 && b.toolIds.length === 1 && a.toolIds[0] === b.toolIds[0]
  && Math.abs(Date.parse(a.date) - Date.parse(b.date)) < 3 * 86400e3;
// Headline = the post's first line or sentence, without links, leading emoji or a trailing colon.
const tweetTitle = (text) => {
  const lines = text.replace(/https?:\/\/\S+/g, '').split(/\n+/).map((l) => l.replace(/^[^\p{L}\p{N}"'“]+/u, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  let t = lines[0] || '';
  if (t.length < 20 && lines[1]) t = `${t.replace(/:$/, '')} — ${lines[1]}`;
  t = t.split(/(?<=[.!?])\s/)[0].replace(/[:\s]+$/, '');
  return t.length > 150 ? `${t.slice(0, t.lastIndexOf(' ', 145))}…` : t;
};

// candidates: { items (tool feed items), extra (news-feed entries), discussions (HN), posts (X) }
// `handleTools(handle)` → { toolIds, broad }: the tools an account belongs to, and whether it's a
// company-wide account (whose posts must prove they're about coding).
export function pickNews({ items, extra, discussions, posts, matchTools, handleTools = () => ({ toolIds: [], broad: false }) }, NOW) {
  const since = NOW - WINDOW_DAYS * 86400e3;
  const cands = [];
  const add = (c) => { if (Date.parse(c.date) >= since && Date.parse(c.date) <= NOW + 6 * 3600e3) cands.push(c); };

  for (const i of items) {
    if (i.kind !== 'blog' && i.kind !== 'changelog') continue;
    add({ id: i.id, title: i.title, url: i.url, date: i.date, summary: i.summary, toolIds: [i.toolId], sources: [{ name: i.source, url: i.url }], ...scoreNews({ title: i.title, text: i.summary, official: true, routine: i.kind === 'changelog' }) });
  }
  for (const e of extra) {
    add({ id: `feed:${e.url}`, title: e.title, url: e.url, date: e.date, summary: e.summary, toolIds: matchTools(e.title), sources: [{ name: e.source, url: e.url }], ...scoreNews({ title: e.title, text: e.summary, official: !e.press }) });
  }
  for (const d of discussions) {
    add({ id: d.id, title: d.title, url: d.url, date: d.date, summary: '', toolIds: d.toolIds || [d.toolId], points: d.points, comments: d.comments, sources: [{ name: `Hacker News · ▲${d.points}`, url: d.hnUrl }], ...scoreNews({ title: d.title, points: d.points }) });
  }
  const fetched = new Map(posts.map((p) => [p.id, p]));
  const pinned = PINNED_POSTS.map((p) => ({ ...p, ...fetched.get(p.id), pinned: p.tag }));
  for (const p of [...posts.filter((q) => !pinned.some((r) => r.id === q.id)), ...pinned]) {
    const title = tweetTitle(p.text);
    if (title.length < 25) continue;
    const own = handleTools(p.handle);
    if (!p.pinned && (LABS.has(p.handle.toLowerCase()) || own.broad) && !labRelevant(p.text)) continue;
    const scored = scoreNews({ title, text: p.text, likes: p.likes, official: true });
    if (p.pinned) Object.assign(scored, { score: Math.max(scored.score, NEWS_MIN), tag: scored.tag || p.pinned });
    add({ id: `x:${p.id}`, title, url: tweetUrl(p.handle, p.id), date: p.date, summary: p.text.length > title.length + 10 ? p.text.replace(/https?:\/\/\S+/g, '').trim().slice(0, 280) : '', toolIds: [...new Set([...(own.toolIds.length === 1 ? own.toolIds : []), ...matchTools(p.text)])], likes: p.likes, sources: [{ name: `X · @${p.handle}`, url: tweetUrl(p.handle, p.id) }], ...scored });
  }

  // Merge the same story told by several sources: coverage in more places makes it more important.
  const merged = [];
  for (const c of cands.sort((a, b) => b.score - a.score)) {
    const twin = merged.find((m) => m.url === c.url || similar(m.title, c.title) || sameIncident(m, c));
    if (!twin) { merged.push({ ...c }); continue; }
    twin.sources.push(...c.sources.filter((s) => !twin.sources.some((t) => t.url === s.url)));
    twin.toolIds = [...new Set([...twin.toolIds, ...c.toolIds])];
    twin.score += Math.min(2, c.score / 3);
    twin.points ??= c.points; twin.comments ??= c.comments;
    if (!twin.summary && c.summary) twin.summary = c.summary;
    if (c.date < twin.date) twin.date = c.date;
  }
  return merged
    .filter((m) => m.score >= NEWS_MIN && m.tag)
    .map((m) => ({ ...m, score: Math.round(m.score * 10) / 10, major: m.score >= NEWS_MAJOR, toolIds: m.toolIds.filter(Boolean) }))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_NEWS);
}

// ── Images ────────────────────────────────────────────────
// Each story's picture: the X post's photo / video poster / link-card image, or the article's
// og:image. Looked up once per story and carried over between runs (null = it has none).
const IMG_UA = 'Mozilla/5.0 (compatible; AI-IDE-News/1.0; +https://aiticker.site)';
const STATUS = /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/\w+\/status\/(\d+)/;
const httpsUrl = (u, base) => { try { const v = new URL(u.replace(/&amp;/g, '&'), base); return v.protocol === 'https:' ? v.href : null; } catch { return null; } };

async function tweetImage(id) {
  // The keyless embed endpoint; its token is derived from the post id the same way x.com's embed does.
  const token = ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
  const res = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${token}&lang=en`, { headers: { 'User-Agent': X_UA }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`X embed ${res.status}`);
  const j = await res.json();
  const card = j.card?.binding_values || {};
  const quoted = j.quoted_tweet?.mediaDetails?.[0]?.media_url_https;
  return httpsUrl(j.mediaDetails?.[0]?.media_url_https || j.video?.poster || quoted
    || (card.summary_photo_image_large || card.thumbnail_image_large || card.photo_image_full_size_large)?.image_value?.url || '');
}

async function pageImage(url) {
  const res = await fetch(url, { headers: { 'User-Agent': IMG_UA, Accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
  if (!res.ok || !/html/.test(res.headers.get('content-type') || '')) return null;
  const head = (await res.text()).slice(0, 200000);
  for (const key of ['og:image', 'og:image:url', 'twitter:image', 'twitter:image:src']) {
    const tag = head.match(new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, 'i'))?.[0];
    const src = tag?.match(/content=["']([^"']+)["']/i)?.[1];
    if (src) return httpsUrl(src, res.url);
  }
  return null;
}

export async function newsImages(news, prevNews = []) {
  const known = new Map(prevNews.filter((n) => n.image !== undefined).map((n) => [n.id, n.image]));
  const todo = news.filter((n) => !known.has(n.id));
  for (let i = 0; i < todo.length; i += 6) {
    await Promise.all(todo.slice(i, i + 6).map(async (n) => {
      try {
        const urls = [n.url, ...n.sources.map((s) => s.url)];
        const tweet = urls.map((u) => u.match(STATUS)?.[1]).find(Boolean);
        known.set(n.id, (tweet ? await tweetImage(tweet) : null) ?? (n.url.match(STATUS) ? null : await pageImage(n.url)));
      } catch { /* try again next run */ }
    }));
  }
  return news.map((n) => (known.has(n.id) ? { ...n, image: known.get(n.id) } : n));
}
