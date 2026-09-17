# Dynamic Subagents

A small Zukhruf coding-agent harness whose root agent, specialist subagents, and
feature-development skill live in Markdown.

The workflow is inspired by the shape of Claude Code's feature-dev plugin—code
exploration, design, implementation, and review—but uses original prompts and
Zukhruf's independent durable agent threads instead of plugin-specific runtime
behavior.

## Workspace

```text
packages/
  harness/  Markdown discovery and AgentDeclaration assembly
  runtime/  Zukhruf queue, stream, mailbox, and Docker sandbox wiring
apps/
  agent/    Minimal one-shot coding agent
    agents/
      coding-agent.md
      subagents/*.md
    skills/feature-development/SKILL.md
```

At startup, `@dynamic-subagents/harness` reads the root declaration and every
immediate Markdown file under `agents/subagents/`, sorts them deterministically,
and produces the ordinary `defineAgent({ subagents })` graph expected by
Zukhruf. Zukhruf then owns spawning, independent conversations, waiting,
mailboxes, and result delivery.

Discovery is intentionally a startup snapshot. Add or edit an agent, then
restart the process.

## Agent declaration

```md
---
name: code-explorer
description: Traces existing behavior and relevant tests.
---

Explore the assigned question without modifying files.
```

The filename must be `<name>.md`. Markdown owns identity, delegation
description, and instructions. The host keeps executable capabilities—model and
sandbox objects—in TypeScript.

## Run

Requirements:

- Node.js 24.11 or newer
- Docker
- an OpenAI API key
- A sibling `../deepagents` checkout with its local packages built; this project
  deliberately file-links `packages/context` and `packages/experimental`.

```sh
npm install
OPENAI_API_KEY=... npm run agent -- \
  --workspace /absolute/path/to/repository \
  "Add a health endpoint following the existing HTTP route conventions"
```

The root defaults to `gpt-5.6-luna`; auxiliary agents default to the smaller
`gpt-5.6-terra`. Override them with `OPENAI_MODEL` and
`OPENAI_SUBAGENT_MODEL`.

The selected repository is mounted read-write at `/workspace` for the root
agent. Subagents receive separate read-only mounts. The app-owned skill is
mounted at `/opt/dynamic-subagents/skills` without copying or hiding files in
the target repository.

## Security

The root agent can modify every file under the selected workspace and its
Docker sandbox has network access. Run it only on repositories and prompts you
trust. The CLI rejects mounting the filesystem root.

## Verify

```sh
npm run check
```

Tests exercise the public package interfaces: Markdown-to-Zukhruf declaration
discovery and complete in-memory runtime startup.
