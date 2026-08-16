import assert from 'node:assert/strict';
import test from 'node:test';

import {
  defineAgent,
  type AgentDeclaration,
} from '@deepagents/experimental/zukhruf';

import { Runtime } from '@dynamic-subagents/runtime';

const model = {
  provider: 'test',
  modelId: 'test-model',
} as AgentDeclaration['model'];
const sandbox = (async () => ({})) as unknown as AgentDeclaration['sandbox'];

test('starts the complete Zukhruf host through the runtime package', async () => {
  await using runtime = await Runtime.start(
    defineAgent({
      name: 'root',
      model,
      sandbox,
      instructions: [],
    }),
  );

  assert.equal(runtime.agent.info.root, 'root');
  assert.deepEqual(runtime.agent.info.agents.map(({ name }) => name), ['root']);
});
