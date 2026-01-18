import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const workItems = sqliteTable(
  'work_items',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['issue', 'feature-request'] }).notNull(),
    title: text('title').notNull(),
    body: text('body'),
    status: text('status', { enum: ['open', 'closed'] })
      .notNull()
      .default('open'),
    // Workspace fields (moved from changesets)
    workspaceStatus: text('workspace_status', { enum: ['not_initialized', 'ready', 'error'] })
      .notNull()
      .default('not_initialized'),
    worktreePath: text('worktree_path'),
    headBranch: text('head_branch'),
    baseBranch: text('base_branch'),
    baseSha: text('base_sha'),
    headSha: text('head_sha'),
    // Locking fields for serialized agent runs
    lockOwnerRunId: text('lock_owner_run_id'),
    lockExpiresAt: integer('lock_expires_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    projectIdIdx: index('idx_work_items_project_id').on(table.projectId),
    statusIdx: index('idx_work_items_status').on(table.status),
    workspaceStatusIdx: index('idx_work_items_workspace_status').on(table.workspaceStatus),
    headBranchIdx: index('idx_work_items_head_branch').on(table.headBranch),
    lockOwnerIdx: index('idx_work_items_lock_owner').on(table.lockOwnerRunId),
  })
);

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  sourceRepoPath: text('source_repo_path').notNull(),
  sourceRepoUrl: text('source_repo_url'),
  relayRepoPath: text('relay_repo_path').notNull(),
  defaultBranch: text('default_branch').notNull(),
  defaultAgent: text('default_agent').notNull().default('opencode'),
  agentParams: text('agent_params'),
  maxAgentConcurrency: integer('max_agent_concurrency').notNull().default(3),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const targetRepos = sqliteTable('target_repos', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  repoPath: text('repo_path').notNull().unique(),
  defaultBranch: text('default_branch').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const pullRequests = sqliteTable(
  'pull_requests',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    workItemId: text('work_item_id')
      .notNull()
      .references(() => workItems.id, { onDelete: 'cascade' })
      .unique(),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status', { enum: ['open', 'merged', 'closed'] })
      .notNull()
      .default('open'),
    sourceBranch: text('source_branch').notNull(),
    targetBranch: text('target_branch').notNull(),
    mergeStrategy: text('merge_strategy', { enum: ['merge', 'squash', 'rebase'] })
      .notNull()
      .default('merge'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    mergedAt: integer('merged_at', { mode: 'timestamp' }),
    mergedBy: text('merged_by'),
    mergeCommitSha: text('merge_commit_sha'),
  },
  (table) => ({
    workItemIdIdx: index('idx_pull_requests_work_item_id').on(table.workItemId),
    statusIdx: index('idx_pull_requests_status').on(table.status),
  })
);

export const reviewThreads = sqliteTable(
  'review_threads',
  {
    id: text('id').primaryKey(),
    pullRequestId: text('pull_request_id')
      .notNull()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['open', 'resolved', 'outdated'] })
      .notNull()
      .default('open'),
    severity: text('severity', { enum: ['info', 'warning', 'error'] })
      .notNull()
      .default('info'),
    anchor: text('anchor').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    pullRequestIdIdx: index('idx_review_threads_pull_request_id').on(table.pullRequestId),
  })
);

export const reviewComments = sqliteTable('review_comments', {
  id: text('id').primaryKey(),
  threadId: text('thread_id')
    .notNull()
    .references(() => reviewThreads.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const agentRuns = sqliteTable(
  'agent_runs',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    workItemId: text('work_item_id')
      .notNull()
      .references(() => workItems.id, { onDelete: 'cascade' }),
    agentKey: text('agent_key').notNull(),
    status: text('status', {
      enum: ['queued', 'running', 'succeeded', 'failed', 'cancelled'],
    })
      .notNull()
      .default('queued'),
    inputSummary: text('input_summary'),
    inputJson: text('input_json').notNull(),
    sessionId: text('session_id').notNull(),
    linkedAgentRunId: text('linked_agent_run_id').references(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (): any => agentRuns.id,
      {
        onDelete: 'set null',
      }
    ),
    log: text('log'),
    logPath: text('log_path'),
    stdoutPath: text('stdout_path'),
    stderrPath: text('stderr_path'),
    headShaBefore: text('head_sha_before'),
    headShaAfter: text('head_sha_after'),
    commitSha: text('commit_sha'),
    startedAt: integer('started_at', { mode: 'timestamp' }),
    finishedAt: integer('finished_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    workItemIdIdx: index('idx_agent_runs_work_item_id').on(table.workItemId),
    sessionIdIdx: index('idx_agent_runs_session_id').on(table.sessionId),
    statusIdx: index('idx_agent_runs_status').on(table.status),
  })
);
