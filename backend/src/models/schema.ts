import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ============================================================================
// Resource Type Enum (Optimized Design)
// ============================================================================

export const RESOURCE_TYPES = [
  'WorkItem',
  'Worktree',
  'Task',
  'AgentRun',
  'PullRequest',
  'GitOps',
  'CommandExec',
] as const;

export type ResourceType = (typeof RESOURCE_TYPES)[number];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const workItems: any = sqliteTable(
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
    idempotencyKey: text('idempotency_key'),
    // Idempotency: link to the NodeRun that created/last updated this resource
    nodeRunId: text('node_run_id').references(() => nodeRuns.id, { onDelete: 'set null' }),
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
    idempotencyKeyIdx: index('idx_work_items_idempotency_key').on(table.idempotencyKey),
    nodeRunIdIdx: index('idx_work_items_node_run_id').on(table.nodeRunId),
  })
);

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  sourceRepoPath: text('source_repo_path').notNull(),
  sourceRepoUrl: text('source_repo_url'),
  mirrorRepoPath: text('mirror_repo_path').notNull(),
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
    idempotencyKey: text('idempotency_key'),
    // Idempotency: link to NodeRun that created this resource
    nodeRunId: text('node_run_id'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    mergedAt: integer('merged_at', { mode: 'timestamp' }),
    mergedBy: text('merged_by'),
    mergeCommitSha: text('merge_commit_sha'),
    syncedCommitSha: text('synced_commit_sha'), // Commit SHA in source repo after sync
  },
  (table) => ({
    workItemIdIdx: index('idx_pull_requests_work_item_id').on(table.workItemId),
    statusIdx: index('idx_pull_requests_status').on(table.status),
    idempotencyKeyIdx: index('idx_pull_requests_idempotency_key').on(table.idempotencyKey),
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

// Tasks table (Domain resource) - must be defined before agentRuns
export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    workItemId: text('work_item_id')
      .notNull()
      .references(() => workItems.id, { onDelete: 'cascade' }),
    taskType: text('task_type').notNull(),
    status: text('status', {
      enum: ['pending', 'running', 'succeeded', 'failed', 'canceled', 'blocked'],
    })
      .notNull()
      .default('pending'),
    input: text('input').notNull().default('{}'),
    output: text('output').notNull().default('{}'),
    currentAgentRunId: text('current_agent_run_id'),
    idempotencyKey: text('idempotency_key'),
    nodeRunId: text('node_run_id').references(() => nodeRuns.id, { onDelete: 'set null' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    workItemIdIdx: index('idx_tasks_work_item_id').on(table.workItemId),
    taskTypeIdx: index('idx_tasks_task_type').on(table.taskType),
    statusIdx: index('idx_tasks_status').on(table.status),
    idempotencyKeyIdx: index('idx_tasks_idempotency_key').on(table.idempotencyKey),
    currentAgentRunIdIdx: index('idx_tasks_current_agent_run_id').on(table.currentAgentRunId),
  })
);

// Worktrees table (Op resource)
export const worktrees = sqliteTable(
  'worktrees',
  {
    id: text('id').primaryKey(),
    workItemId: text('work_item_id')
      .notNull()
      .references(() => workItems.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    branch: text('branch').notNull(),
    repoSha: text('repo_sha'),
    status: text('status', {
      enum: ['pending', 'running', 'succeeded', 'failed', 'canceled'],
    })
      .notNull()
      .default('pending'),
    idempotencyKey: text('idempotency_key'),
    nodeRunId: text('node_run_id').references(() => nodeRuns.id, { onDelete: 'set null' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    workItemIdIdx: index('idx_worktrees_work_item_id').on(table.workItemId),
    statusIdx: index('idx_worktrees_status').on(table.status),
    idempotencyKeyIdx: index('idx_worktrees_idempotency_key').on(table.idempotencyKey),
  })
);

// GitOps table (Op resource)
export const gitOps = sqliteTable(
  'git_ops',
  {
    id: text('id').primaryKey(),
    workItemId: text('work_item_id')
      .notNull()
      .references(() => workItems.id, { onDelete: 'cascade' }),
    operation: text('operation').notNull(),
    status: text('status', {
      enum: ['pending', 'running', 'succeeded', 'failed', 'canceled'],
    })
      .notNull()
      .default('pending'),
    input: text('input').notNull().default('{}'),
    output: text('output').notNull().default('{}'),
    idempotencyKey: text('idempotency_key'),
    nodeRunId: text('node_run_id').references(() => nodeRuns.id, { onDelete: 'set null' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    workItemIdIdx: index('idx_git_ops_work_item_id').on(table.workItemId),
    operationIdx: index('idx_git_ops_operation').on(table.operation),
    statusIdx: index('idx_git_ops_status').on(table.status),
    idempotencyKeyIdx: index('idx_git_ops_idempotency_key').on(table.idempotencyKey),
  })
);

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
    taskId: text('task_id').references(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (): any => tasks.id,
      { onDelete: 'set null' }
    ),
    agentKey: text('agent_key').notNull(),
    status: text('status', {
      enum: ['queued', 'running', 'succeeded', 'failed', 'cancelled'],
    })
      .notNull()
      .default('queued'),
    inputSummary: text('input_summary'),
    inputJson: text('input_json').notNull(),
    sessionId: text('session_id'), // Nullable: set to null if no session available (task cannot be resumed)
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
    pid: integer('pid'), // Process ID for tracking running processes
    idempotencyKey: text('idempotency_key'),
    // Idempotency: link to NodeRun that created this resource
    nodeRunId: text('node_run_id'),
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
    taskIdIdx: index('idx_agent_runs_task_id').on(table.taskId),
    idempotencyKeyIdx: index('idx_agent_runs_idempotency_key').on(table.idempotencyKey),
  })
);

export const workflows = sqliteTable(
  'workflows',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    definition: text('definition').notNull(), // JSON stringified Workflow
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
    version: integer('version').notNull().default(1),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    projectIdIdx: index('idx_workflows_project_id').on(table.projectId),
    projectNameUnique: index('idx_workflows_project_name_unique').on(table.projectId, table.name),
  })
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const workflowRuns: any = sqliteTable(
  'workflow_runs',
  {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    workItemId: text('work_item_id')
      .notNull()
      .references(() => workItems.id, { onDelete: 'cascade' }),
    status: text('status', {
      enum: ['pending', 'running', 'succeeded', 'failed', 'canceled', 'blocked'],
    })
      .notNull()
      .default('pending'),
    currentStepId: text('current_step_id'),
    startedAt: integer('started_at', { mode: 'timestamp' }),
    finishedAt: integer('finished_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    workflowIdIdx: index('idx_workflow_runs_workflow_id').on(table.workflowId),
    workItemIdIdx: index('idx_workflow_runs_work_item_id').on(table.workItemId),
    statusIdx: index('idx_workflow_runs_status').on(table.status),
  })
);

// CommandExec table for optimized workflow design
// Uses file paths for stdout/stderr like agent_runs, instead of storing text directly
export const commandExecs = sqliteTable(
  'command_execs',
  {
    id: text('id').primaryKey(),
    workItemId: text('work_item_id')
      .notNull()
      .references(() => workItems.id, { onDelete: 'cascade' }),
    nodeRunId: text('node_run_id'),
    command: text('command').notNull(),
    status: text('status', { enum: ['pending', 'running', 'succeeded', 'failed'] })
      .notNull()
      .default('pending'),
    exitCode: integer('exit_code'),
    stdoutPath: text('stdout_path'),
    stderrPath: text('stderr_path'),
    logPath: text('log_path'),
    idempotencyKey: text('idempotency_key'),
    startedAt: integer('started_at', { mode: 'timestamp' }),
    completedAt: integer('completed_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    workItemIdIdx: index('idx_command_execs_work_item_id').on(table.workItemId),
    nodeRunIdIdx: index('idx_command_execs_node_run_id').on(table.nodeRunId),
    statusIdx: index('idx_command_execs_status').on(table.status),
    idempotencyKeyIdx: index('idx_command_execs_idempotency_key').on(table.idempotencyKey),
  })
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const nodeRuns: any = sqliteTable(
  'node_runs',
  {
    id: text('id').primaryKey(),
    runId: text('run_id').notNull(),
    workflowRunId: text('workflow_run_id')
      .notNull()
      .references(() => workflowRuns.id, { onDelete: 'cascade' }),
    nodeId: text('node_id').notNull(),
    resourceType: text('resource_type', {
      enum: RESOURCE_TYPES,
    }).notNull(),
    subjectKind: text('subject_kind', {
      enum: ['workitem', 'task', 'pr_request', 'worktree'],
    }).notNull(),
    subjectId: text('subject_id').notNull(),
    subjectVersionAtStart: integer('subject_version_at_start').notNull(),
    status: text('status', {
      enum: ['pending', 'running', 'succeeded', 'failed', 'canceled', 'blocked'],
    })
      .notNull()
      .default('pending'),
    attempt: integer('attempt').notNull().default(1),
    idempotencyKey: text('idempotency_key'),
    input: text('input').notNull(), // JSON stringified
    output: text('output').notNull(), // JSON stringified
    error: text('error'),
    startedAt: integer('started_at', { mode: 'timestamp' }),
    finishedAt: integer('finished_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    workflowRunIdIdx: index('idx_node_runs_workflow_run_id').on(table.workflowRunId),
    nodeIdIdx: index('idx_node_runs_node_id').on(table.nodeId),
    resourceTypeIdx: index('idx_node_runs_resource_type').on(table.resourceType),
    subjectIdx: index('idx_node_runs_subject').on(table.subjectKind, table.subjectId),
    idempotencyKeyIdx: index('idx_node_runs_idempotency_key').on(table.idempotencyKey),
    statusIdx: index('idx_node_runs_status').on(table.status),
  })
);

// Global app settings (key-value). Keys: defaultAgent, defaultAgentParams (JSON)
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const eventOutbox = sqliteTable(
  'event_outbox',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id').notNull().unique(),
    eventType: text('event_type').notNull(),
    eventData: text('event_data').notNull(), // JSON stringified
    subjectKind: text('subject_kind').notNull(),
    subjectId: text('subject_id').notNull(),
    resourceVersion: integer('resource_version'),
    causedBy: text('caused_by'), // JSON stringified
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    processedAt: integer('processed_at', { mode: 'timestamp' }),
    retryCount: integer('retry_count').notNull().default(0),
  },
  (table) => ({
    eventIdIdx: index('idx_event_outbox_event_id').on(table.eventId),
    subjectIdx: index('idx_event_outbox_subject').on(table.subjectKind, table.subjectId),
    processedIdx: index('idx_event_outbox_processed').on(table.processedAt),
  })
);
