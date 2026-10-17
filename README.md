# Patchwire — AI IDE & CLI News

**Live site:** https://ai-ide-news.github.io/

A live tracker of the latest releases, patches, changelogs and community discussion for AI IDEs and AI coding CLIs — Cursor, Claude Code, Codex CLI, Gemini CLI, GitHub Copilot (+ CLI), Kiro, Google Antigravity, Zed, VS Code, Windsurf, Trae, JetBrains AI/Junie, OpenCode, Amp, Qwen Code, Kimi CLI, Goose, Crush, OpenHands, Aider, Cline, Roo Code, Kilo Code, Continue and Augment Code.

## Real data only

| Source | Used for |
|---|---|
| GitHub Releases API | Versions & release notes for open-source tools |
| Official changelog RSS/Atom feeds | Cursor, Kiro, Amp, GitHub Copilot changelogs |
| Official blog feeds | VS Code, Zed, Windsurf, Trae, JetBrains AI, Augment, OpenAI (Codex), Google (Gemini CLI / Antigravity) |
| Hacker News (Algolia API) | Community discussion |
| GitHub Search API | Auto-discovering trending open-source coding agents, IDEs & extensions |

### Trending auto-discovery

On every refresh, `scripts/discover.mjs` searches GitHub for repos in the niche (coding-agent / AI-IDE topics and descriptions), filters out skill packs, guides, MCP servers, proxies and other companion utilities, and keeps only tools that shipped a stable GitHub Release in the last 60 days. Their release notes become their changelog on the site, and a daily star history ranks them by star velocity. Tune it via `DISCOVERY` in `scripts/sources.mjs` (`allow` / `deny` lists, star threshold, cap).

A GitHub Actions workflow checks every source for new releases every 10 minutes (using conditional requests, so unchanged repos cost nothing) and rebuilds + deploys only when something shipped; a full refresh (trending discovery, stars, HN) runs every 3 hours. An always-on watcher job (`.github/workflows/watch.yml`) also checks every source once a minute and triggers a deploy the moment something ships (~2–3 min from release to live). Open pages poll a tiny `version.json` and show a "new updates" prompt as soon as a new build lands. If a source fails, the previous snapshot for that source is kept.

## Develop

```bash
npm install
npm run dev   # fetch → build → serve on http://localhost:4173
```

Add a curated tool in `scripts/sources.mjs` (trending ones are added automatically). Outputs: HTML pages, `feed.xml` (RSS), `data.json` (JSON API), `sitemap.xml`.

---

Made by [Abdullah ElTiby](https://github.com/AbdullahElTiby).
