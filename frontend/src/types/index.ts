/**
 * Shared TypeScript types for the Git Vibe frontend
 * These types are imported from the shared package and adapted for frontend use
 */

import type {
  WorkItem as SharedWorkItem,
  Project as SharedProject,
  TargetRepo as SharedTargetRepo,
  PullRequest as SharedPullRequest,
  ReviewThread as SharedReviewThread,
  ReviewComment as SharedReviewComment,
  AgentRun as SharedAgentRun,
  Import as SharedImport,
} from 'git-vibe-shared';

// ============================================================================
// Re-export shared types for backward compatibility
// ============================================================================

export type {
  WorkItemType,
  WorkItemStatus,
  WorkspaceStatus,
  PullRequestStatus,
  AgentRunStatus,
  ImportStatus,
  ImportStrategy,
  ReviewThreadStatus,
  ReviewThreadSeverity,
  RepoFile,
  AgentModel,
  AgentParams,
  AgentKey,
} from 'git-vibe-shared';

// ============================================================================
// Model Types (with Date conversion for frontend)
// ============================================================================

/**
 * WorkItem represents an Issue or Feature Request
 * WorkItems own workspaces (worktree + branch) for agent execution
 */
export interface WorkItem extends Omit<SharedWorkItem, 'createdAt' | 'updatedAt'> {
  createdAt: Date;
  updatedAt: Date;
}

/**
 * PullRequest represents a pull request for a WorkItem
 */
export interface PullRequest extends Omit<
  SharedPullRequest,
  'mergedAt' | 'createdAt' | 'updatedAt'
> {
  mergedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * AgentRun represents an AI agent execution on a work item
 */
export interface AgentRun extends Omit<
  SharedAgentRun,
  'startedAt' | 'finishedAt' | 'createdAt' | 'updatedAt'
> {
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Import represents importing changes from a pull request to a target repository
 */
export interface Import extends Omit<
  SharedImport,
  'startedAt' | 'finishedAt' | 'createdAt' | 'updatedAt'
> {
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * ReviewThread represents a review thread on a pull request
 */
export interface ReviewThread extends Omit<SharedReviewThread, 'createdAt' | 'updatedAt'> {
  createdAt: Date;
  updatedAt: Date;
}

/**
 * ReviewComment represents a comment within a review thread
 */
export interface ReviewComment extends Omit<SharedReviewComment, 'createdAt'> {
  createdAt: Date;
}

/**
 * Project represents a source project
 */
export interface Project extends Omit<SharedProject, 'createdAt' | 'updatedAt'> {
  createdAt: Date;
  updatedAt: Date;
}

/**
 * TargetRepo represents a target repository for imports
 */
export interface TargetRepo extends Omit<SharedTargetRepo, 'createdAt' | 'updatedAt'> {
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Frontend-Specific Types
// ============================================================================

/**
 * Worktree status for PR worktrees
 */
export type WorktreeStatus = 'present' | 'missing' | 'recreating';

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
