-- Add workflow-related tables to match final schema
-- These tables (workflows, workflow_runs, step_executions) are in the main schema

-- Workflows table
CREATE TABLE IF NOT EXISTS "workflows" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"definition" text NOT NULL,
	"is_default" integer NOT NULL DEFAULT 0,
	"created_at" integer NOT NULL DEFAULT (unixepoch()),
	"updated_at" integer NOT NULL DEFAULT (unixepoch()),
	FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_workflows_project_id" ON "workflows" ("project_id");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_workflows_project_name_unique" ON "workflows" ("project_id", "name");

-- Workflow runs table
CREATE TABLE IF NOT EXISTS "workflow_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_id" text NOT NULL,
	"work_item_id" text NOT NULL,
	"status" text NOT NULL DEFAULT 'pending',
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

-- Step executions table
CREATE TABLE IF NOT EXISTS "step_executions" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"node_id" text NOT NULL,
	"status" text NOT NULL DEFAULT 'pending',
	"started_at" integer,
	"finished_at" integer,
	"error_message" text,
	"outputs" text NOT NULL,
	"artifacts" text NOT NULL,
	FOREIGN KEY ("run_id") REFERENCES "workflow_runs"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_step_executions_run_id" ON "step_executions" ("run_id");
CREATE INDEX IF NOT EXISTS "idx_step_executions_node_id" ON "step_executions" ("node_id");
CREATE INDEX IF NOT EXISTS "idx_step_executions_status" ON "step_executions" ("status");
