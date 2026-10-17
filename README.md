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

A GitHub Actions workflow re-fetches everything every 3 hours, rebuilds the static site and deploys it to GitHub Pages. If a source fails, the previous snapshot for that source is kept.

## Develop

```bash
npm install
npm run dev   # fetch → build → serve on http://localhost:4173
```

Add a tool in `scripts/sources.mjs`. Outputs: HTML pages, `feed.xml` (RSS), `data.json` (JSON API), `sitemap.xml`.
