import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import type { AgentDeclaration } from '@deepagents/experimental/zukhruf';

import { discoverAgentTree } from '@dynamic-subagents/harness';

const model = {
  provider: 'test',
  modelId: 'test-model',
} as AgentDeclaration['model'];
const sandbox = (async () => ({})) as unknown as AgentDeclaration['sandbox'];

test('discovers a deterministic Markdown agent tree through the public interface', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dynamic-subagents-'));
  const subagents = join(directory, 'subagents');
  await mkdir(subagents);

  try {
    await writeFile(
      join(directory, 'root.md'),
      '---\nname: root\ndescription: Root agent\n---\nLead the work.',
    );
    await writeFile(
      join(subagents, 'reviewer.md'),
      '---\nname: reviewer\ndescription: Reviews changes\n---\nReview carefully.',
    );
    await writeFile(
      join(subagents, 'explorer.md'),
      '---\nname: explorer\ndescription: Explores code\n---\nTrace the code.',
    );

    const tree = await discoverAgentTree({
      rootFile: pathToFileURL(join(directory, 'root.md')),
      subagentsDirectory: pathToFileURL(`${subagents}/`),
      root: { model, sandbox },
      subagents: { model, sandbox },
    });

    assert.equal(tree.declaration.name, 'root');
    assert.deepEqual(
      tree.declaration.subagents?.map(({ name }) => name),
      ['explorer', 'reviewer'],
    );
    assert.match(tree.usageHintText, /explorer: Explores code/);
    assert.match(tree.usageHintText, /reviewer: Reviews changes/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
