-- Initial schema migration
-- Creates all tables, indexes, and foreign key constraints

CREATE TABLE IF NOT EXISTS "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"source_repo_path" text NOT NULL,
	"source_repo_url" text,
	"relay_repo_path" text NOT NULL,
	"default_branch" text NOT NULL,
	"default_agent" text NOT NULL DEFAULT 'opencode',
	"agent_params" text,
	"max_agent_concurrency" integer NOT NULL DEFAULT 3,
	"created_at" integer NOT NULL DEFAULT (unixepoch()),
	"updated_at" integer NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS "projects_name_unique" ON "projects" ("name");

CREATE TABLE IF NOT EXISTS "work_items" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"status" text NOT NULL DEFAULT 'open',
	"workspace_status" text NOT NULL DEFAULT 'not_initialized',
	"worktree_path" text,
	"head_branch" text,
	"base_branch" text,
	"base_sha" text,
	"head_sha" text,
	"lock_owner_run_id" text,
	"lock_expires_at" integer,
	"created_at" integer NOT NULL DEFAULT (unixepoch()),
	"updated_at" integer NOT NULL DEFAULT (unixepoch()),
	FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_work_items_project_id" ON "work_items" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_work_items_status" ON "work_items" ("status");
CREATE INDEX IF NOT EXISTS "idx_work_items_workspace_status" ON "work_items" ("workspace_status");
CREATE INDEX IF NOT EXISTS "idx_work_items_head_branch" ON "work_items" ("head_branch");
CREATE INDEX IF NOT EXISTS "idx_work_items_lock_owner" ON "work_items" ("lock_owner_run_id");

CREATE TABLE IF NOT EXISTS "target_repos" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"repo_path" text NOT NULL,
	"default_branch" text NOT NULL,
	"created_at" integer NOT NULL DEFAULT (unixepoch()),
	"updated_at" integer NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS "target_repos_repo_path_unique" ON "target_repos" ("repo_path");

CREATE TABLE IF NOT EXISTS "pull_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"work_item_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text NOT NULL DEFAULT 'open',
	"source_branch" text NOT NULL,
	"target_branch" text NOT NULL,
	"merge_strategy" text NOT NULL DEFAULT 'merge',
	"created_at" integer NOT NULL DEFAULT (unixepoch()),
	"updated_at" integer NOT NULL DEFAULT (unixepoch()),
	"merged_at" integer,
	"merged_by" text,
	"merge_commit_sha" text,
	FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE,
	FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "pull_requests_work_item_id_unique" ON "pull_requests" ("work_item_id");
CREATE INDEX IF NOT EXISTS "idx_pull_requests_work_item_id" ON "pull_requests" ("work_item_id");
CREATE INDEX IF NOT EXISTS "idx_pull_requests_status" ON "pull_requests" ("status");

CREATE TABLE IF NOT EXISTS "review_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"pull_request_id" text NOT NULL,
	"status" text NOT NULL DEFAULT 'open',
	"severity" text NOT NULL DEFAULT 'info',
	"anchor" text NOT NULL,
	"created_at" integer NOT NULL DEFAULT (unixepoch()),
	"updated_at" integer NOT NULL DEFAULT (unixepoch()),
	FOREIGN KEY ("pull_request_id") REFERENCES "pull_requests"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_review_threads_pull_request_id" ON "review_threads" ("pull_request_id");

CREATE TABLE IF NOT EXISTS "review_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" integer NOT NULL DEFAULT (unixepoch()),
	FOREIGN KEY ("thread_id") REFERENCES "review_threads"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "agent_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"work_item_id" text NOT NULL,
	"agent_key" text NOT NULL,
	"status" text NOT NULL DEFAULT 'queued',
	"input_summary" text,
	"input_json" text NOT NULL,
	"session_id" text NOT NULL,
	"linked_agent_run_id" text,
	"log" text,
	"log_path" text,
	"stdout_path" text,
	"stderr_path" text,
	"head_sha_before" text,
	"head_sha_after" text,
	"commit_sha" text,
	"started_at" integer,
	"finished_at" integer,
	"created_at" integer NOT NULL DEFAULT (unixepoch()),
	"updated_at" integer NOT NULL DEFAULT (unixepoch()),
	FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE,
	FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE,
	FOREIGN KEY ("linked_agent_run_id") REFERENCES "agent_runs"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_agent_runs_work_item_id" ON "agent_runs" ("work_item_id");
CREATE INDEX IF NOT EXISTS "idx_agent_runs_session_id" ON "agent_runs" ("session_id");
CREATE INDEX IF NOT EXISTS "idx_agent_runs_status" ON "agent_runs" ("status");

CREATE TABLE IF NOT EXISTS "imports" (
	"id" text PRIMARY KEY NOT NULL,
	"pull_request_id" text NOT NULL,
	"target_repo_id" text NOT NULL,
	"strategy" text NOT NULL,
	"status" text NOT NULL DEFAULT 'pending',
	"source_base_sha" text NOT NULL,
	"source_head_sha" text NOT NULL,
	"target_base_sha" text,
	"target_result_sha" text,
	"log" text,
	"started_at" integer,
	"finished_at" integer,
	"created_at" integer NOT NULL DEFAULT (unixepoch()),
	"updated_at" integer NOT NULL DEFAULT (unixepoch()),
	FOREIGN KEY ("pull_request_id") REFERENCES "pull_requests"("id") ON DELETE CASCADE,
	FOREIGN KEY ("target_repo_id") REFERENCES "target_repos"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_imports_pull_request_id" ON "imports" ("pull_request_id");
