-- Migration: Optimized Workflow Refactor
-- Implements the optimized workflow design as specified in docs/architecture/optimized_workflow_design.md
--
-- Changes:
-- 1. Adds mirror_repo_path to projects table
-- 2. Drops unused tables: imports, target_repos
-- 3. Creates infrastructure tables: workflows, workflow_runs, node_runs, command_execs, event_outbox
-- 4. Creates tasks table (Domain resource) - separates Task from AgentRun
-- 5. Creates worktrees table (Op resource) - separates Worktree from work_items fields
-- 6. Creates git_ops table (Op resource) - new resource type for git operations
-- 7. Modifies agent_runs table: adds task_id, idempotency_key, makes session_id nullable, adds pid
-- 8. Adds idempotency_key to pull_requests and work_items tables
--
-- Key principles:
-- - Domain resources (WorkItem, Task, PullRequest) vs Op resources (Worktree, AgentRun, GitOps, CommandExec)
-- - Task is a Domain resource that orchestrates AgentRun (Op resource)
-- - Each resource table has idempotency_key for idempotency enforcement

-- Add mirror_repo_path to projects table
-- Multiple projects with the same source path share the same mirror repo
CREATE TABLE IF NOT EXISTS "projects_new" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"source_repo_path" text NOT NULL,
	"source_repo_url" text,
	"mirror_repo_path" text NOT NULL DEFAULT '',
	"relay_repo_path" text NOT NULL,
	"default_branch" text NOT NULL,
	"default_agent" text NOT NULL DEFAULT 'opencode',
	"agent_params" text,
	"max_agent_concurrency" integer NOT NULL DEFAULT 3,
	"created_at" integer NOT NULL DEFAULT (unixepoch()),
	"updated_at" integer NOT NULL DEFAULT (unixepoch())
);

-- Copy data from old projects to new projects
INSERT INTO "projects_new" (
	"id", "name", "source_repo_path", "source_repo_url", "relay_repo_path",
	"default_branch", "default_agent", "agent_params", "max_agent_concurrency",
	"created_at", "updated_at"
)
SELECT
	"id", "name", "source_repo_path", "source_repo_url", "relay_repo_path",
	"default_branch", "default_agent", "agent_params", "max_agent_concurrency",
	"created_at", "updated_at"
FROM "projects";

-- Drop old projects table
DROP TABLE IF EXISTS "projects";

-- Rename new table to projects
ALTER TABLE "projects_new" RENAME TO "projects";

-- Recreate indexes for projects
CREATE UNIQUE INDEX IF NOT EXISTS "projects_name_unique" ON "projects" ("name");

-- Drop unused tables that are not in the final schema
DROP TABLE IF EXISTS "imports";
DROP TABLE IF EXISTS "target_repos";

-- Create infrastructure tables (must be created before tables that reference them)

-- Create workflows table
CREATE TABLE IF NOT EXISTS "workflows" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"definition" text NOT NULL,
	"is_default" integer NOT NULL DEFAULT 0,
	"version" integer NOT NULL DEFAULT 1,
	"created_at" integer NOT NULL DEFAULT (unixepoch()),
	"updated_at" integer NOT NULL DEFAULT (unixepoch()),
	FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_workflows_project_id" ON "workflows" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_workflows_project_name_unique" ON "workflows" ("project_id", "name");

-- Create workflow_runs table
CREATE TABLE IF NOT EXISTS "workflow_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_id" text NOT NULL,
	"work_item_id" text NOT NULL,
	"status" text NOT NULL CHECK("status" IN ('pending', 'running', 'succeeded', 'failed', 'blocked', 'skipped')) DEFAULT 'pending',
	"current_step_id" text,
	"started_at" integer,
	"finished_at" integer,
	"created_at" integer NOT NULL DEFAULT (unixepoch()),
	FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE,
	FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_workflow_runs_workflow_id" ON "workflow_runs" ("workflow_id");
CREATE INDEX IF NOT EXISTS "idx_workflow_runs_work_item_id" ON "workflow_runs" ("work_item_id");
CREATE INDEX IF NOT EXISTS "idx_workflow_runs_status" ON "workflow_runs" ("status");

-- Create node_runs table (must be created before tasks, worktrees, git_ops reference it)
CREATE TABLE IF NOT EXISTS "node_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"workflow_run_id" text NOT NULL,
	"node_id" text NOT NULL,
	"resource_type" text NOT NULL CHECK("resource_type" IN ('WorkItem', 'Worktree', 'Task', 'AgentRun', 'PullRequest', 'GitOps', 'CommandExec')),
	"subject_kind" text NOT NULL CHECK("subject_kind" IN ('workitem', 'task', 'pr_request', 'worktree')),
	"subject_id" text NOT NULL,
	"subject_version_at_start" integer NOT NULL,
	"status" text NOT NULL CHECK("status" IN ('pending', 'running', 'succeeded', 'failed', 'canceled', 'blocked')) DEFAULT 'pending',
	"attempt" integer NOT NULL DEFAULT 1,
	"idempotency_key" text,
	"input" text NOT NULL,
	"output" text NOT NULL,
	"error" text,
	"started_at" integer,
	"finished_at" integer,
	"created_at" integer NOT NULL DEFAULT (unixepoch()),
	FOREIGN KEY ("workflow_run_id") REFERENCES "workflow_runs"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_node_runs_workflow_run_id" ON "node_runs" ("workflow_run_id");
CREATE INDEX IF NOT EXISTS "idx_node_runs_node_id" ON "node_runs" ("node_id");
CREATE INDEX IF NOT EXISTS "idx_node_runs_resource_type" ON "node_runs" ("resource_type");
CREATE INDEX IF NOT EXISTS "idx_node_runs_subject" ON "node_runs" ("subject_kind", "subject_id");
CREATE INDEX IF NOT EXISTS "idx_node_runs_idempotency_key" ON "node_runs" ("idempotency_key");
CREATE INDEX IF NOT EXISTS "idx_node_runs_status" ON "node_runs" ("status");

-- Create command_execs table (Op resource)
-- Uses file paths for stdout/stderr like agent_runs, instead of storing text directly
CREATE TABLE IF NOT EXISTS "command_execs" (
	"id" text PRIMARY KEY NOT NULL,
	"work_item_id" text NOT NULL,
	"node_run_id" text,
	"command" text NOT NULL,
	"status" text NOT NULL CHECK("status" IN ('pending', 'running', 'succeeded', 'failed')) DEFAULT 'pending',
	"exit_code" integer,
	"stdout_path" text,
	"stderr_path" text,
	"log_path" text,
	"idempotency_key" text,
	"started_at" integer,
	"completed_at" integer,
	"created_at" integer NOT NULL DEFAULT (unixepoch()),
	"updated_at" integer NOT NULL DEFAULT (unixepoch()),
	FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_command_execs_work_item_id" ON "command_execs" ("work_item_id");
CREATE INDEX IF NOT EXISTS "idx_command_execs_node_run_id" ON "command_execs" ("node_run_id");
CREATE INDEX IF NOT EXISTS "idx_command_execs_status" ON "command_execs" ("status");
CREATE INDEX IF NOT EXISTS "idx_command_execs_idempotency_key" ON "command_execs" ("idempotency_key");
CREATE UNIQUE INDEX IF NOT EXISTS "command_execs_idempotency_key_unique" ON "command_execs" ("idempotency_key") WHERE "idempotency_key" IS NOT NULL;

-- Create event_outbox table
CREATE TABLE IF NOT EXISTS "event_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL UNIQUE,
	"event_type" text NOT NULL,
	"event_data" text NOT NULL,
	"subject_kind" text NOT NULL,
	"subject_id" text NOT NULL,
	"resource_version" integer,
	"caused_by" text,
	"created_at" integer NOT NULL DEFAULT (unixepoch()),
	"processed_at" integer,
	"retry_count" integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS "idx_event_outbox_event_id" ON "event_outbox" ("event_id");
CREATE INDEX IF NOT EXISTS "idx_event_outbox_subject" ON "event_outbox" ("subject_kind", "subject_id");
CREATE INDEX IF NOT EXISTS "idx_event_outbox_processed" ON "event_outbox" ("processed_at");

-- Create tasks table (Domain resource)
CREATE TABLE IF NOT EXISTS "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"work_item_id" text NOT NULL,
	"task_type" text NOT NULL,
	"status" text NOT NULL CHECK("status" IN ('pending', 'running', 'succeeded', 'failed', 'canceled', 'blocked')) DEFAULT 'pending',
	"input" text NOT NULL DEFAULT '{}',
	"output" text NOT NULL DEFAULT '{}',
	"current_agent_run_id" text,
	"idempotency_key" text,
	"node_run_id" text,
	"created_at" integer NOT NULL DEFAULT (unixepoch()),
	"updated_at" integer NOT NULL DEFAULT (unixepoch()),
	FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE,
	FOREIGN KEY ("node_run_id") REFERENCES "node_runs"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_tasks_work_item_id" ON "tasks" ("work_item_id");
CREATE INDEX IF NOT EXISTS "idx_tasks_task_type" ON "tasks" ("task_type");
CREATE INDEX IF NOT EXISTS "idx_tasks_status" ON "tasks" ("status");
CREATE INDEX IF NOT EXISTS "idx_tasks_idempotency_key" ON "tasks" ("idempotency_key");
CREATE INDEX IF NOT EXISTS "idx_tasks_current_agent_run_id" ON "tasks" ("current_agent_run_id");
CREATE UNIQUE INDEX IF NOT EXISTS "tasks_idempotency_key_unique" ON "tasks" ("idempotency_key") WHERE "idempotency_key" IS NOT NULL;

-- Create worktrees table (Op resource)
CREATE TABLE IF NOT EXISTS "worktrees" (
	"id" text PRIMARY KEY NOT NULL,
	"work_item_id" text NOT NULL,
	"path" text NOT NULL,
	"branch" text NOT NULL,
	"repo_sha" text,
	"status" text NOT NULL CHECK("status" IN ('pending', 'running', 'succeeded', 'failed', 'canceled')) DEFAULT 'pending',
	"idempotency_key" text,
	"node_run_id" text,
	"created_at" integer NOT NULL DEFAULT (unixepoch()),
	"updated_at" integer NOT NULL DEFAULT (unixepoch()),
	FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE,
	FOREIGN KEY ("node_run_id") REFERENCES "node_runs"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_worktrees_work_item_id" ON "worktrees" ("work_item_id");
CREATE INDEX IF NOT EXISTS "idx_worktrees_status" ON "worktrees" ("status");
CREATE INDEX IF NOT EXISTS "idx_worktrees_idempotency_key" ON "worktrees" ("idempotency_key");
CREATE UNIQUE INDEX IF NOT EXISTS "worktrees_idempotency_key_unique" ON "worktrees" ("idempotency_key") WHERE "idempotency_key" IS NOT NULL;

-- Create git_ops table (Op resource)
CREATE TABLE IF NOT EXISTS "git_ops" (
	"id" text PRIMARY KEY NOT NULL,
	"work_item_id" text NOT NULL,
	"operation" text NOT NULL,
	"status" text NOT NULL CHECK("status" IN ('pending', 'running', 'succeeded', 'failed', 'canceled')) DEFAULT 'pending',
	"input" text NOT NULL DEFAULT '{}',
	"output" text NOT NULL DEFAULT '{}',
	"idempotency_key" text,
	"node_run_id" text,
	"created_at" integer NOT NULL DEFAULT (unixepoch()),
	"updated_at" integer NOT NULL DEFAULT (unixepoch()),
	FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE,
	FOREIGN KEY ("node_run_id") REFERENCES "node_runs"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_git_ops_work_item_id" ON "git_ops" ("work_item_id");
CREATE INDEX IF NOT EXISTS "idx_git_ops_operation" ON "git_ops" ("operation");
CREATE INDEX IF NOT EXISTS "idx_git_ops_status" ON "git_ops" ("status");
CREATE INDEX IF NOT EXISTS "idx_git_ops_idempotency_key" ON "git_ops" ("idempotency_key");
CREATE UNIQUE INDEX IF NOT EXISTS "git_ops_idempotency_key_unique" ON "git_ops" ("idempotency_key") WHERE "idempotency_key" IS NOT NULL;

-- Modify agent_runs table: add task_id and idempotency_key
-- SQLite doesn't support ALTER TABLE ADD COLUMN with foreign keys directly, so we recreate the table
CREATE TABLE IF NOT EXISTS "agent_runs_new" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"work_item_id" text NOT NULL,
	"task_id" text,
	"agent_key" text NOT NULL,
	"status" text NOT NULL CHECK("status" IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')) DEFAULT 'queued',
	"input_summary" text,
	"input_json" text NOT NULL,
	"session_id" text,
	"linked_agent_run_id" text,
	"log" text,
	"log_path" text,
	"stdout_path" text,
	"stderr_path" text,
	"head_sha_before" text,
	"head_sha_after" text,
	"commit_sha" text,
	"pid" integer,
	"idempotency_key" text,
	"node_run_id" text,
	"started_at" integer,
	"finished_at" integer,
	"created_at" integer NOT NULL DEFAULT (unixepoch()),
	"updated_at" integer NOT NULL DEFAULT (unixepoch()),
	FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE,
	FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE,
	FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL
);

-- Copy data from old agent_runs to new agent_runs
-- Note: pid and node_run_id don't exist in the old table, so we use NULL for them
INSERT INTO "agent_runs_new" (
	"id", "project_id", "work_item_id", "agent_key", "status", "input_summary", "input_json",
	"session_id", "linked_agent_run_id", "log", "log_path", "stdout_path", "stderr_path",
	"head_sha_before", "head_sha_after", "commit_sha", "pid", "node_run_id", "started_at", "finished_at",
	"created_at", "updated_at"
)
SELECT
	"id", "project_id", "work_item_id", "agent_key", "status", "input_summary", "input_json",
	"session_id", "linked_agent_run_id", "log", "log_path", "stdout_path", "stderr_path",
	"head_sha_before", "head_sha_after", "commit_sha", NULL as "pid", NULL as "node_run_id", "started_at", "finished_at",
	"created_at", "updated_at"
FROM "agent_runs";

-- Drop old agent_runs table
DROP TABLE IF EXISTS "agent_runs";

-- Rename new table to agent_runs
ALTER TABLE "agent_runs_new" RENAME TO "agent_runs";

-- Recreate indexes for agent_runs
CREATE INDEX IF NOT EXISTS "idx_agent_runs_work_item_id" ON "agent_runs" ("work_item_id");
CREATE INDEX IF NOT EXISTS "idx_agent_runs_session_id" ON "agent_runs" ("session_id");
CREATE INDEX IF NOT EXISTS "idx_agent_runs_status" ON "agent_runs" ("status");
CREATE INDEX IF NOT EXISTS "idx_agent_runs_node_run_id" ON "agent_runs" ("node_run_id");
CREATE INDEX IF NOT EXISTS "idx_agent_runs_task_id" ON "agent_runs" ("task_id");
CREATE INDEX IF NOT EXISTS "idx_agent_runs_idempotency_key" ON "agent_runs" ("idempotency_key");
CREATE UNIQUE INDEX IF NOT EXISTS "agent_runs_idempotency_key_unique" ON "agent_runs" ("idempotency_key") WHERE "idempotency_key" IS NOT NULL;

-- Note: command_execs table is created above with idempotency_key already included

-- Add idempotency_key & node_run_id to pull_requests table
ALTER TABLE "pull_requests" ADD COLUMN "idempotency_key" text;
ALTER TABLE "pull_requests" ADD COLUMN "node_run_id" text;
CREATE INDEX IF NOT EXISTS "idx_pull_requests_idempotency_key" ON "pull_requests" ("idempotency_key");
CREATE INDEX IF NOT EXISTS "idx_pull_requests_node_run_id" ON "pull_requests" ("node_run_id");
CREATE UNIQUE INDEX IF NOT EXISTS "pull_requests_idempotency_key_unique" ON "pull_requests" ("idempotency_key") WHERE "idempotency_key" IS NOT NULL;

-- Add idempotency_key and node_run_id to work_items table
ALTER TABLE "work_items" ADD COLUMN "idempotency_key" text;
ALTER TABLE "work_items" ADD COLUMN "node_run_id" text;
CREATE INDEX IF NOT EXISTS "idx_work_items_idempotency_key" ON "work_items" ("idempotency_key");
CREATE INDEX IF NOT EXISTS "idx_work_items_node_run_id" ON "work_items" ("node_run_id");
CREATE UNIQUE INDEX IF NOT EXISTS "work_items_idempotency_key_unique" ON "work_items" ("idempotency_key") WHERE "idempotency_key" IS NOT NULL;
