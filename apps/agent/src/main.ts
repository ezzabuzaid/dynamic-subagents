import { openai } from "@ai-sdk/openai";
import { consumeStream, createUIMessageStream } from "ai";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { AgentRuntime } from "@deepagents/experimental/zukhruf";
import { discoverAgentTree } from "@dynamic-subagents/harness";
import {
  createWorkspaceSandbox,
  createRuntimeStack,
} from "@dynamic-subagents/runtime";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    workspace: { type: "string", short: "C" },
  },
});

const input = positionals.join(" ").trim();
if (!input) {
  throw new Error(
    'Usage: npm run agent -- --workspace /path/to/repo "Describe the feature"',
  );
}
if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is required");
}

const workspaceDirectory = values.workspace ?? process.cwd();
const skillsDirectory = new URL("../skills/", import.meta.url);
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
  rootFile: new URL("../agents/coding-agent.md", import.meta.url),
  subagentsDirectory: new URL("../agents/subagents/", import.meta.url),
  root: {
    model: openai(process.env.OPENAI_MODEL ?? "gpt-5.6-luna"),
    sandbox: rootSandbox,
  },
  subagents: {
    model: openai(process.env.OPENAI_SUBAGENT_MODEL ?? "gpt-5.6-terra"),
    sandbox: subagentSandbox,
  },
});

const runtime = new AgentRuntime(tree.declaration);
const stack = createRuntimeStack({ usageHintText: tree.usageHintText });
await using host = await runtime.initialize(stack);
await host.work({ concurrency: 4 });
const turn = await host.enqueue(
  { chatId: crypto.randomUUID(), userId: process.env.USER ?? "local" },
  {
    trigger: "submit-message",
    message: {
      id: crypto.randomUUID(),
      role: "user",
      parts: [{ type: "text", text: input }],
    },
  },
);
await consumeStream({
  stream: createUIMessageStream({
    execute: ({ writer }) => writer.merge(turn.stream),
    onEnd: ({ responseMessage }) => {
      for (const part of responseMessage.parts) {
        if (part.type === "text") console.log(part.text);
      }
    },
  }),
});
