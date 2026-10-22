# aiticker — AI IDE & CLI News

**Live site:** https://aiticker.site/

A live tracker of the latest releases, patches, changelogs and community discussion for AI IDEs and AI coding CLIs — Cursor, Claude Code, Codex CLI, Gemini CLI, GitHub Copilot (+ CLI), Kiro, Google Antigravity, Zed, VS Code, Windsurf, Trae, JetBrains AI/Junie, OpenCode, Amp, Qwen Code, Kimi CLI, Goose, Crush, OpenHands, Aider, Cline, Roo Code, Kilo Code, Continue and Augment Code.

## Real data only

| Source | Used for |
|---|---|
| GitHub Releases API | Versions & release notes for open-source tools |
| Official changelog RSS/Atom feeds | Cursor, Kiro, Amp, GitHub Copilot changelogs |
| Official blog feeds | VS Code, Zed, Windsurf, Trae, JetBrains AI, Augment, OpenAI (Codex), Google (Gemini CLI / Antigravity) |
| Hacker News (Algolia API) | Community discussion |
| GitHub Search API | Auto-discovering trending open-source coding agents, IDEs & extensions |
| OpenRouter models API | New models from the major labs (release date, context window, API price) |
| GitHub Search API (Skills & MCP) | `/skills/` and `/mcp/` pages: trending Agent Skills and MCP server repos, ranked by star velocity (`scripts/ecosystem.mjs`, tuned via `ECOSYSTEM` in `scripts/sources.mjs`) |
| Official MCP Registry (`registry.modelcontextprotocol.io`) | Servers just published to the registry, on the MCP page |
| OpenCode Data (`opencode.ai/data/index.json`) | Real-world model usage on the OpenCode tool page: tokens, daily users, retention, session cost, cache ratio, market share by lab, countries |

### Trending auto-discovery

On every refresh, `scripts/discover.mjs` searches GitHub for repos in the niche (coding-agent / AI-IDE topics and descriptions), filters out skill packs, guides, MCP servers, proxies and other companion utilities, and keeps only tools that shipped a stable GitHub Release in the last 60 days. Their release notes become their changelog on the site, and a daily star history ranks them by star velocity. Tune it via `DISCOVERY` in `scripts/sources.mjs` (`allow` / `deny` lists, star threshold).

A GitHub Actions workflow checks every source for new releases every 10 minutes (using conditional requests, so unchanged repos cost nothing) and rebuilds + deploys only when something shipped; a full refresh (trending discovery, stars, HN) runs every 3 hours. An always-on watcher job (`.github/workflows/watch.yml`) also checks every source once a minute and triggers a deploy the moment something ships (~2–3 min from release to live). Open pages poll a tiny `version.json` and show a "new updates" prompt as soon as a new build lands. If a source fails, the previous snapshot for that source is kept.

## My feed

`/my-feed/` lets each reader build their own stream: pick tools from the catalog (releases & changelogs), toggle the curated news / Hacker News, and add any outside source — an RSS/Atom/JSON feed, a website (its feed is auto-discovered), a YouTube channel (`yt:@handle` or URL), a subreddit (`r/name`), a Bluesky profile, a Mastodon account (`@user@host`), or an Instagram / X profile. Picks are stored in the browser (localStorage) and can be shared with a link; there are no accounts.

Outside sources are read through a small Cloudflare Worker (`worker/`), since browsers can't read most feeds directly:

```bash
cd worker && npm install && npx wrangler deploy
```

Then set the repo variable `FEED_PROXY` to the Worker URL (e.g. `https://aiticker-feeds.<you>.workers.dev`). Without it, the page still works with the catalog sources only. Instagram and X have no public feeds: set `INSTAGRAM_BRIDGE` / `X_BRIDGE` in `worker/wrangler.toml` to a bridge URL template such as a self-hosted RSSHub (`https://rsshub.example.com/instagram/user/{user}`), or users can paste an RSS.app / RSSHub link for the profile directly.

## Develop

```bash
npm install
npm run dev   # fetch → build → serve on http://localhost:4173
```

Add a curated tool in `scripts/sources.mjs` (trending ones are added automatically). Outputs: HTML pages, `feed.xml` (RSS), `data.json` (JSON API), `sitemap.xml`.

---

Made by [Abdullah ElTiby](https://github.com/AbdullahElTiby).
