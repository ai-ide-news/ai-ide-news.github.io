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

A GitHub Actions workflow re-fetches everything every 3 hours, rebuilds the static site and deploys it to GitHub Pages. If a source fails, the previous snapshot for that source is kept.

## Develop

```bash
npm install
npm run dev   # fetch → build → serve on http://localhost:4173
```

Add a curated tool in `scripts/sources.mjs` (trending ones are added automatically). Outputs: HTML pages, `feed.xml` (RSS), `data.json` (JSON API), `sitemap.xml`.

---

Made by [Abdullah ElTiby](https://github.com/AbdullahElTiby).
