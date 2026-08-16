import { createHash } from 'node:crypto';
import { realpathSync, statSync } from 'node:fs';
import { parse } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { PgBoss, fromPglite } from 'pg-boss';

import {
  createDockerSandbox,
  InMemoryContextStore,
  pkg,
  PollingChangeSource,
  SqliteStreamStore,
  StreamManager,
} from '@deepagents/context';
import {
  AgentRuntime,
  defineSandbox,
  PgBossTurnQueue,
  SqliteMailboxStore,
  type AgentDeclaration,
  type MultiAgentV2HostConfig,
} from '@deepagents/experimental/zukhruf';

export interface RuntimeOptions {
  concurrency?: number;
  multiAgentV2?: MultiAgentV2HostConfig;
}

/** Running in-memory Zukhruf host with queue, streams, and mailboxes wired. */
export class Runtime implements AsyncDisposable {
  readonly agent: AgentRuntime;
  readonly #resources: AsyncDisposableStack;

  private constructor(agent: AgentRuntime, resources: AsyncDisposableStack) {
    this.agent = agent;
    this.#resources = resources;
  }

  static async start(
    declaration: AgentDeclaration,
    options: RuntimeOptions = {},
  ): Promise<Runtime> {
    const resources = new AsyncDisposableStack();
    try {
      const database = resources.adopt(
        new PGlite(),
        (database) => database.close(),
      );
      const boss = resources.adopt(
        new PgBoss({ db: fromPglite(database), backend: 'pglite' }),
        (boss) => boss.stop(),
      );
      boss.on('error', (error) => console.error('[queue error]', error));
      await boss.start();

      const queue = new PgBossTurnQueue(boss, { schema: 'pgboss' });
      await queue.initialize();
      const streamStore = resources.adopt(
        new SqliteStreamStore(':memory:'),
        (store) => store.close(),
      );
      const streams = new StreamManager({
        store: streamStore,
        changeSource: new PollingChangeSource({ reads: streamStore }),
      });
      const mailboxStore = resources.use(new SqliteMailboxStore(':memory:'));
      const agent = new AgentRuntime(declaration, {
        store: new InMemoryContextStore(),
        streams,
        queue,
        mailboxStore,
        multiAgentV2: options.multiAgentV2,
      });
      resources.use(
        await agent.work({ concurrency: options.concurrency ?? 4 }),
      );
      return new Runtime(agent, resources);
    } catch (error) {
      await resources.disposeAsync();
      throw error;
    }
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.#resources.disposeAsync();
  }
}

export interface WorkspaceSandboxOptions {
  workspaceDirectory: string;
  skillsDirectory: string;
  readOnly?: boolean;
}

/** Mount one host workspace plus the app-owned skills into a Docker sandbox. */
export function createWorkspaceSandbox(options: WorkspaceSandboxOptions) {
  const workspaceDirectory = existingDirectory(
    options.workspaceDirectory,
    'workspaceDirectory',
  );
  const skillsDirectory = existingDirectory(
    options.skillsDirectory,
    'skillsDirectory',
  );

  return defineSandbox(({ chatId }) =>
    createDockerSandbox({
      name: `dynamic-subagents-${createHash('sha256')
        .update(chatId)
        .digest('hex')
        .slice(0, 16)}`,
      image: 'bash:5.3-alpine3.24',
      installers: [pkg(['git', 'nodejs', 'npm', 'ripgrep'])],
      security: { securityOpt: ['no-new-privileges'] },
      volumes: [
        {
          type: 'bind',
          hostPath: workspaceDirectory,
          containerPath: '/workspace',
          readOnly: options.readOnly ?? false,
        },
        {
          type: 'bind',
          hostPath: skillsDirectory,
          containerPath: '/opt/dynamic-subagents/skills',
          readOnly: true,
        },
      ],
    }),
  );
}

function existingDirectory(value: string, name: string): string {
  const directory = realpathSync(value);
  if (!statSync(directory).isDirectory()) {
    throw new Error(`${name} must be a directory`);
  }
  if (directory === parse(directory).root) {
    throw new Error(`${name} cannot be the filesystem root`);
  }
  return directory;
}
