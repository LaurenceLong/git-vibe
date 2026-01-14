/**
 * Shared TypeScript types for the Git Vibe frontend
 * These types align with the backend models but are adapted for frontend use
 */

/**
 * WorkItem represents an Issue or Feature Request
 * WorkItems are task definitions only - they do NOT own worktrees or branches
 * Changesets (PRs) handle workspaces and can optionally link to WorkItems
 */
export interface WorkItem {
  id: string;
  projectId: string;
  type: WorkItemType;
  title: string;
  body: string | null;
  status: WorkItemStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * WorkItem status type
 */
export type WorkItemStatus = 'open' | 'closed';

/**
 * WorkItem type (issue or feature request)
 */
export type WorkItemType = 'issue' | 'feature-request';

/**
 * PR status type
 */
export type PRStatus = 'open' | 'merged' | 'closed';

/**
 * Worktree status type
 */
export type WorktreeStatus = 'present' | 'missing' | 'recreating';

/**
 * ChangeSet represents a set of changes in a project
 */
export interface ChangeSet {
  id: string;
  projectId: string;
  workItemId: string | null;
  title: string;
  body: string | null;
  status: 'draft' | 'active' | 'completed' | 'cancelled';
  prStatus: PRStatus | null;
  baseBranch: string;
  baseSha: string;
  branchName: string;
  headSha: string | null;
  worktreePath: string;
  mergedAt: Date | null;
  closedAt: Date | null;
  syncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * AgentRun represents an AI agent execution on a changeset
 */
export interface AgentRun {
  id: string;
  changesetId: string;
  agentKey: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  inputSummary: string | null;
  inputJson: string;
  log: string | null;
  logPath: string | null;
  headShaBefore: string | null;
  headShaAfter: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Import represents importing changes to a target repository
 */
export interface Import {
  id: string;
  changesetId: string;
  targetRepoId: string;
  strategy: 'patch';
  status:
    | 'pending'
    | 'running'
    | 'succeeded'
    | 'succeeded_noop'
    | 'failed'
    | 'failed_dirty'
    | 'failed_conflict'
    | 'failed_other';
  sourceBaseSha: string;
  sourceHeadSha: string;
  targetBaseSha: string | null;
  targetResultSha: string | null;
  log: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * ReviewThread represents a review thread on a changeset
 */
export interface ReviewThread {
  id: string;
  changesetId: string;
  status: 'open' | 'resolved' | 'outdated';
  severity: 'info' | 'warning' | 'error';
  anchor: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * ReviewComment represents a comment within a review thread
 */
export interface ReviewComment {
  id: string;
  threadId: string;
  body: string;
  createdAt: Date;
}

/**
 * Project represents a source project
 */
export interface Project {
  id: string;
  name: string;
  sourceRepoPath: string;
  sourceRepoUrl: string | null;
  relayRepoPath: string;
  defaultBranch: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * TargetRepo represents a target repository for imports
 */
export interface TargetRepo {
  id: string;
  name: string;
  repoPath: string;
  defaultBranch: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * RepoFile represents a file or directory in a repository
 */
export interface RepoFile {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
}

/**
 * API response wrapper types
 */
export interface ApiResponse<T> {
  data: T;
  error?: string;
}

/**
 * Paginated response type
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Form error type
 */
export interface FormError {
  field: string;
  message: string;
}

/**
 * Form input types for WorkItem operations
 */
export type CreateWorkItemInput = {
  projectId: string;
  type: 'issue' | 'feature-request';
  title: string;
  body?: string;
};

export type UpdateWorkItemInput = {
  title?: string;
  body?: string;
  status?: 'open' | 'closed';
};
