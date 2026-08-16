import { readdir, readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseFrontmatter, role } from '@deepagents/context';
import {
  defineAgent,
  type AgentDeclaration,
} from '@deepagents/experimental/zukhruf';

type AgentDefaults = Pick<AgentDeclaration, 'model' | 'sandbox'>;

export interface DiscoverAgentTreeOptions {
  rootFile: URL;
  subagentsDirectory: URL;
  root: AgentDefaults;
  subagents: AgentDefaults;
}

export interface DiscoveredAgentTree {
  declaration: AgentDeclaration;
  usageHintText: string;
}

interface LoadedAgent {
  declaration: AgentDeclaration;
  description: string;
}

/** Discover one root and its immediate Markdown subagents at process startup. */
export async function discoverAgentTree(
  options: DiscoverAgentTreeOptions,
): Promise<DiscoveredAgentTree> {
  const entries = (await readdir(options.subagentsDirectory, {
    withFileTypes: true,
  }))
    .filter(
      (entry) =>
        entry.isFile() &&
        !entry.name.startsWith('.') &&
        extname(entry.name) === '.md',
    )
    .toSorted((left, right) => left.name.localeCompare(right.name));

  const subagents = await Promise.all(
    entries.map((entry) =>
      loadAgent(new URL(entry.name, options.subagentsDirectory), options.subagents),
    ),
  );
  const root = await loadAgent(options.rootFile, options.root);

  return {
    declaration: defineAgent({
      ...root.declaration,
      subagents: subagents.map(({ declaration }) => declaration),
    }),
    usageHintText: [
      'Discovered subagent types:',
      ...subagents.map(
        ({ declaration, description }) =>
          `- ${declaration.name}: ${description}`,
      ),
    ].join('\n'),
  };
}

async function loadAgent(
  file: URL,
  defaults: AgentDefaults,
): Promise<LoadedAgent> {
  const fileName = basename(fileURLToPath(file));
  let parsed: ReturnType<typeof parseFrontmatter>;
  try {
    parsed = parseFrontmatter(await readFile(file, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid agent declaration ${fileName}`, { cause: error });
  }

  const { frontmatter, body } = parsed;
  if (fileName !== `${frontmatter.name}.md`) {
    throw new Error(
      `Invalid agent declaration ${fileName}: frontmatter name must match the filename`,
    );
  }
  if (!body) {
    throw new Error(
      `Invalid agent declaration ${fileName}: instructions cannot be empty`,
    );
  }

  return {
    description: frontmatter.description,
    declaration: defineAgent({
      name: frontmatter.name,
      model: defaults.model,
      sandbox: defaults.sandbox,
      instructions: [role(body)],
    }),
  };
}
