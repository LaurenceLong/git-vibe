-- Modify agent_runs table to match final schema
-- 1. Make session_id nullable
-- 2. Drop foreign key constraint on linked_agent_run_id
-- 3. Add pid column for process tracking

-- Make session_id nullable (SQLite requires recreating the table)
-- First, create a new table with the correct schema
CREATE TABLE IF NOT EXISTS "agent_runs_new" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"work_item_id" text NOT NULL,
	"agent_key" text NOT NULL,
	"status" text NOT NULL DEFAULT 'queued',
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
	"started_at" integer,
	"finished_at" integer,
	"created_at" integer NOT NULL DEFAULT (unixepoch()),
	"updated_at" integer NOT NULL DEFAULT (unixepoch()),
	FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE,
	FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE
);

-- Copy data from old table to new table
INSERT INTO "agent_runs_new" (
	"id", "project_id", "work_item_id", "agent_key", "status",
	"input_summary", "input_json", "session_id", "linked_agent_run_id",
	"log", "log_path", "stdout_path", "stderr_path",
	"head_sha_before", "head_sha_after", "commit_sha",
	"started_at", "finished_at", "created_at", "updated_at"
)
SELECT
	"id", "project_id", "work_item_id", "agent_key", "status",
	"input_summary", "input_json", "session_id", "linked_agent_run_id",
	"log", "log_path", "stdout_path", "stderr_path",
	"head_sha_before", "head_sha_after", "commit_sha",
	"started_at", "finished_at", "created_at", "updated_at"
FROM "agent_runs";

-- Drop the old table
DROP TABLE "agent_runs";

-- Rename the new table to the original name
ALTER TABLE "agent_runs_new" RENAME TO "agent_runs";

-- Recreate indexes
CREATE INDEX IF NOT EXISTS "idx_agent_runs_work_item_id" ON "agent_runs" ("work_item_id");
CREATE INDEX IF NOT EXISTS "idx_agent_runs_session_id" ON "agent_runs" ("session_id");
CREATE INDEX IF NOT EXISTS "idx_agent_runs_status" ON "agent_runs" ("status");

-- Add pid column
ALTER TABLE "agent_runs" ADD COLUMN "pid" integer;
