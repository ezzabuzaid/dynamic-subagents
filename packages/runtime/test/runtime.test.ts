import assert from "node:assert/strict";
import test from "node:test";

import { createVirtualSandbox } from "@deepagents/context";
import {
  AgentRuntime,
  defineAgent,
  defineSandbox,
} from "@deepagents/experimental/zukhruf";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { InMemoryFs } from "just-bash";

import { createRuntimeStack } from "@dynamic-subagents/runtime";

const model = new MockLanguageModelV4({
  doStream: async () => ({
    stream: simulateReadableStream({
      chunks: [
        { type: "text-start", id: "text-1" },
        { type: "text-delta", id: "text-1", delta: "done" },
        { type: "text-end", id: "text-1" },
        {
          type: "finish",
          finishReason: { unified: "stop", raw: "stop" },
          usage: {
            inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 1, text: 1, reasoning: 0 },
          },
        },
      ],
    }),
  }),
});
const sandbox = defineSandbox(() =>
  createVirtualSandbox({ fs: new InMemoryFs() }),
);

test("starts the complete Zukhruf host through the stack recipe", async () => {
  const runtime = new AgentRuntime(
    defineAgent({
      name: "root",
      model,
      sandbox,
      instructions: [],
    }),
  );
  const stack = createRuntimeStack({});
  await using host = await runtime.initialize(stack);

  await host.work({ concurrency: 4 });
  assert.equal(host.info.root, "root");
  assert.deepEqual(
    host.info.agents.map(({ name }) => name),
    ["root"],
  );
  const conversation = { chatId: "runtime-test", userId: "test" };
  const turn = await host.enqueue(conversation, {
    trigger: "submit-message",
    message: {
      id: "message-1",
      role: "user",
      parts: [{ type: "text", text: "Say done." }],
    },
  });
  let text = "";
  await turn.stream.pipeTo(
    new WritableStream({
      write(part) {
        if (part.type === "text-delta") text += part.delta;
      },
    }),
  );
  assert.equal(text, "done");
  assert.equal(
    (await host.observe(conversation).status(turn.id))?.status,
    "completed",
  );
});
