import { DatabaseSync } from 'node:sqlite';

import { PGlite } from '@electric-sql/pglite';
import { PgBoss, fromPglite } from 'pg-boss';

import {
  InMemoryContextStore,
  PollingChangeSource,
  SqliteStreamStore,
  StreamManager,
} from '@deepagents/context';
import {
  PgBossTurnQueue,
  SqliteMailboxStore,
  defineStack,
  type MultiAgentHostConfig,
} from '@deepagents/experimental/zukhruf';

/** A fresh runtime owns this in-memory queue, stream store, and mailbox. */
export function createRuntimeStack(multiAgent: MultiAgentHostConfig) {
  return defineStack(async (resources) => {
    const database = resources.use(new PGlite());
    const boss = resources.adopt(
      new PgBoss({ db: fromPglite(database), backend: 'pglite' }),
      (boss) => boss.stop(),
    );
    boss.on('error', (error) => console.error('[queue error]', error));
    await boss.start();

    const queue = new PgBossTurnQueue(boss, { schema: 'pgboss' });
    await queue.initialize();
    const streamStore = new SqliteStreamStore(
      resources.use(new DatabaseSync(':memory:')),
    );
    return {
      store: new InMemoryContextStore(),
      streams: new StreamManager({
        store: streamStore,
        changeSource: new PollingChangeSource({ reads: streamStore }),
      }),
      queue,
      mailboxStore: resources.use(new SqliteMailboxStore(':memory:')),
      multiAgent,
    };
  });
}
