import { openai } from '@ai-sdk/openai';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { renderTurn } from '@deepagents/experimental/zukhruf';
import { discoverAgentTree } from '@dynamic-subagents/harness';
import {
  createWorkspaceSandbox,
  Runtime,
} from '@dynamic-subagents/runtime';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    workspace: { type: 'string', short: 'C' },
  },
});

const input = positionals.join(' ').trim();
if (!input) {
  throw new Error(
    'Usage: npm run agent -- --workspace /path/to/repo "Describe the feature"',
  );
}
if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is required');
}

const workspaceDirectory = values.workspace ?? process.cwd();
const skillsDirectory = new URL('../skills/', import.meta.url);
const rootSandbox = createWorkspaceSandbox({
  workspaceDirectory,
  skillsDirectory: fileURLToPath(skillsDirectory),
});
const subagentSandbox = createWorkspaceSandbox({
  workspaceDirectory,
  skillsDirectory: fileURLToPath(skillsDirectory),
  readOnly: true,
});
const tree = await discoverAgentTree({
  rootFile: new URL('../agents/coding-agent.md', import.meta.url),
  subagentsDirectory: new URL('../agents/subagents/', import.meta.url),
  root: {
    model: openai(process.env.OPENAI_MODEL ?? 'gpt-5.6-luna'),
    sandbox: rootSandbox,
  },
  subagents: {
    model: openai(process.env.OPENAI_SUBAGENT_MODEL ?? 'gpt-5.6-terra'),
    sandbox: subagentSandbox,
  },
});

await using runtime = await Runtime.start(tree.declaration, {
  concurrency: 4,
  multiAgentV2: { usageHintText: tree.usageHintText },
});
const turn = await runtime.agent.enqueue(
  { chatId: crypto.randomUUID(), userId: process.env.USER ?? 'local' },
  { id: crypto.randomUUID(), input },
);
await renderTurn(turn.stream);
