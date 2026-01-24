-- Add mirror_repo_path column to projects table
-- Multiple projects with the same source path share the same mirror repo
-- Note: For existing projects, the mirror_repo_path will need to be populated
-- by recalculating it from source_repo_path (this should be done in application code)
ALTER TABLE projects ADD COLUMN mirror_repo_path TEXT NOT NULL DEFAULT '';
