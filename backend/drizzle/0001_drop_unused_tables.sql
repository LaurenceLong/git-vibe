-- Drop unused tables that are not in the final schema
-- These tables (target_repos, imports) were in the initial v1 schema but are not used

-- Drop imports table (cascades to pull_requests if needed)
DROP TABLE IF EXISTS "imports";

-- Drop target_repos table
DROP TABLE IF EXISTS "target_repos";
