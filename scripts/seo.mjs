// Human-readable topic hubs: real static URLs, not JavaScript-only category filters.
export const TOOL_TOPICS = {
  ide: {
    slug: 'ai-ides', title: 'AI IDEs',
    description: 'Track AI IDE releases and changelogs for coding editors such as Cursor, Windsurf and Zed.',
    guidance: 'AI IDEs put coding assistance inside an editor. Start with the tools you already use, check their latest changes, then compare plans and supported workflows before switching editors.',
  },
  cli: {
    slug: 'ai-coding-agents', title: 'AI Coding Agents & CLIs',
    description: 'Follow AI coding agent and CLI releases, including Claude Code, Codex CLI, Gemini CLI and OpenCode.',
    guidance: 'Terminal coding agents work alongside your existing editor. Review release notes for changes to permissions, tool use and model support; verify installation instructions in the official documentation.',
  },
  extension: {
    slug: 'ai-editor-extensions', title: 'AI Editor Extensions',
    description: 'Follow AI coding extensions, their latest versions and release notes for your existing editor.',
    guidance: 'Editor extensions add AI assistance without replacing your editor. Check editor compatibility, model-provider requirements and recent release notes before installing an extension.',
  },
  desktop: {
    slug: 'ai-coding-desktop-apps', title: 'AI Coding Desktop Apps',
    description: 'Track desktop AI coding apps, version updates and official changelogs in one place.',
    guidance: 'Desktop coding apps offer a dedicated interface for working with coding agents. Check operating-system support and whether an update applies to the desktop app, its bundled agent or both.',
  },
  cloud: {
    slug: 'cloud-coding-agents', title: 'Cloud Coding Agents',
    description: 'Follow cloud coding agent releases and updates for hosted development workflows.',
    guidance: 'Cloud coding agents run work in hosted environments. Before connecting a repository, review access permissions, execution limits and how the service handles your code and credentials.',
  },
  builder: {
    slug: 'ai-app-builders', title: 'AI App Builders',
    description: 'Track AI app builder updates, product launches and official changelogs.',
    guidance: 'AI app builders turn prompts into applications. Compare code export, hosting options and usage limits, then read product updates for changes that affect maintaining or deploying your app.',
  },
};

export const topicPath = (category) => `tools/${TOOL_TOPICS[category].slug}/`;

// Keep the snippet useful before it is truncated; do not append an entire tool catalog.
export function toolDescription(tool, version, date) {
  return `${tool.name}${version ? ` ${version}` : ''}: latest ${version ? 'release' : 'update'}${date ? ` (${date})` : ''}. Read official release notes, version history and recent changes from ${tool.vendor}.`;
}
