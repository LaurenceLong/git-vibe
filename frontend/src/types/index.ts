/**
 * Shared TypeScript types for the Git Vibe frontend
 * These types are imported from the shared package
 *
 * Note: All date fields are ISO 8601 strings (not Date objects)
 * The HTTP client is the parsing boundary, validating responses with Zod schemas
 */

// ============================================================================
// Re-export shared types for backward compatibility
// ============================================================================

export type {
  WorkItemType,
  WorkItemStatus,
  WorkspaceStatus,
  PullRequestStatus,
  AgentRunStatus,
  ReviewThreadStatus,
  ReviewThreadSeverity,
  RepoFile,
  Commit,
  CommitWithTask,
  AgentModel,
  AgentParams,
  AgentKey,
} from 'git-vibe-shared';

// Type alias for backward compatibility
export type PRStatus = import('git-vibe-shared').PullRequestStatus;

// ============================================================================
// Re-export DTO types (validated by shared Zod schemas)
// ============================================================================

export type {
  WorkItemDTO,
  ProjectDTO,
  TargetRepoDTO,
  PullRequestDTO,
  ReviewThreadDTO,
  ReviewCommentDTO,
  AgentRunDTO,
} from 'git-vibe-shared';

// ============================================================================
// Type aliases for backward compatibility
// ============================================================================

// Type aliases for components that still use the old names
// These will be phased out in favor of DTO types
export type WorkItem = import('git-vibe-shared').WorkItemDTO;
export type Project = import('git-vibe-shared').ProjectDTO;
export type TargetRepo = import('git-vibe-shared').TargetRepoDTO;
export type PullRequest = import('git-vibe-shared').PullRequestDTO;
export type ReviewThread = import('git-vibe-shared').ReviewThreadDTO;
export type ReviewComment = import('git-vibe-shared').ReviewCommentDTO;
export type AgentRun = import('git-vibe-shared').AgentRunDTO;

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
