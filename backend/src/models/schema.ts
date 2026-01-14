import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const workItems = sqliteTable('work_items', {
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
  branchName: text('branch_name').notNull(),
  baseSha: text('base_sha').notNull(),
  headSha: text('head_sha'),
  worktreePath: text('worktree_path'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  sourceRepoPath: text('source_repo_path').notNull().unique(),
  sourceRepoUrl: text('source_repo_url'),
  defaultBranch: text('default_branch').notNull(),
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

export const changesets = sqliteTable('changesets', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  workItemId: text('work_item_id').references(() => workItems.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  body: text('body'),
  status: text('status', { enum: ['draft', 'active', 'completed', 'cancelled'] })
    .notNull()
    .default('draft'),
  prStatus: text('pr_status', { enum: ['open', 'merged', 'closed'] }),
  baseBranch: text('base_branch').notNull(),
  baseSha: text('base_sha').notNull(),
  branchName: text('branch_name').notNull(),
  headSha: text('head_sha'),
  worktreePath: text('worktree_path').notNull(),
  mergedAt: integer('merged_at', { mode: 'timestamp' }),
  closedAt: integer('closed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const reviewThreads = sqliteTable('review_threads', {
  id: text('id').primaryKey(),
  changesetId: text('changeset_id')
    .notNull()
    .references(() => changesets.id, { onDelete: 'cascade' }),
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
});

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

export const agentRuns = sqliteTable('agent_runs', {
  id: text('id').primaryKey(),
  changesetId: text('changeset_id')
    .notNull()
    .references(() => changesets.id, { onDelete: 'cascade' }),
  agentKey: text('agent_key').notNull(),
  status: text('status', {
    enum: ['queued', 'running', 'succeeded', 'failed', 'cancelled'],
  })
    .notNull()
    .default('queued'),
  inputSummary: text('input_summary'),
  inputJson: text('input_json').notNull(),
  log: text('log'),
  logPath: text('log_path'),
  headShaBefore: text('head_sha_before'),
  headShaAfter: text('head_sha_after'),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const imports = sqliteTable('imports', {
  id: text('id').primaryKey(),
  changesetId: text('changeset_id')
    .notNull()
    .references(() => changesets.id, { onDelete: 'cascade' }),
  targetRepoId: text('target_repo_id')
    .notNull()
    .references(() => targetRepos.id, { onDelete: 'cascade' }),
  strategy: text('strategy', { enum: ['patch'] }).notNull(),
  status: text('status', {
    enum: ['pending', 'running', 'succeeded', 'failed'],
  })
    .notNull()
    .default('pending'),
  sourceBaseSha: text('source_base_sha').notNull(),
  sourceHeadSha: text('source_head_sha').notNull(),
  targetBaseSha: text('target_base_sha'),
  targetResultSha: text('target_result_sha'),
  log: text('log'),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});
