/**
 * Backend Model Types
 *
 * This file imports shared types from the git-vibe-shared package and provides
 * backend-specific type mappings. The backend uses Date objects internally,
 * while the shared package uses ISO 8601 strings for API compatibility.
 */

// ============================================================================
// Import Shared Types (with Date instead of string for dates)
// ============================================================================

import type {
  WorkItem as SharedWorkItem,
  Project as SharedProject,
  TargetRepo as SharedTargetRepo,
  PullRequest as SharedPullRequest,
  ReviewThread as SharedReviewThread,
  ReviewComment as SharedReviewComment,
  AgentRun as SharedAgentRun,
  AgentParams as SharedAgentParams,
  WorkItemType,
  WorkItemStatus,
  WorkspaceStatus,
  PullRequestStatus,
  AgentRunStatus,
  ReviewThreadStatus,
  ReviewThreadSeverity,
  AgentKey,
} from 'git-vibe-shared';

// ============================================================================
// Backend Types (with Date objects for internal use)
// ============================================================================

export type WorkItem = Omit<SharedWorkItem, 'createdAt' | 'updatedAt' | 'lockExpiresAt'> & {
  createdAt: Date;
  updatedAt: Date;
  lockExpiresAt: Date | null;
};

export type AgentParams = SharedAgentParams;

export type Project = Omit<SharedProject, 'createdAt' | 'updatedAt'> & {
  createdAt: Date;
  updatedAt: Date;
};

export type TargetRepo = Omit<SharedTargetRepo, 'createdAt' | 'updatedAt'> & {
  createdAt: Date;
  updatedAt: Date;
};

export type PullRequest = Omit<SharedPullRequest, 'createdAt' | 'updatedAt' | 'mergedAt'> & {
  createdAt: Date;
  updatedAt: Date;
  mergedAt: Date | null;
};

export type ReviewThread = Omit<SharedReviewThread, 'createdAt' | 'updatedAt'> & {
  createdAt: Date;
  updatedAt: Date;
};

export type ReviewComment = Omit<SharedReviewComment, 'createdAt'> & {
  createdAt: Date;
};

export type AgentRun = Omit<
  SharedAgentRun,
  'createdAt' | 'updatedAt' | 'startedAt' | 'finishedAt'
> & {
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};

// ============================================================================
// Re-export Enums from shared package
// ============================================================================

export type {
  WorkItemType,
  WorkItemStatus,
  WorkspaceStatus,
  PullRequestStatus,
  AgentRunStatus,
  ReviewThreadStatus,
  ReviewThreadSeverity,
  AgentKey,
};

// ============================================================================
// Type Conversion Helpers
// ============================================================================

/**
 * Convert backend model (with Date) to shared model (with ISO string)
 */
export type ToShared<T extends { createdAt: Date; updatedAt: Date }> = Omit<
  T,
  'createdAt' | 'updatedAt' | 'mergedAt' | 'closedAt' | 'syncedAt' | 'startedAt' | 'finishedAt'
> & {
  createdAt: string;
  updatedAt: string;
  mergedAt?: string | null;
  closedAt?: string | null;
  syncedAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
};

/**
 * Convert Date to ISO 8601 string
 */
export function toISOString(date: Date | null | undefined): string | null {
  if (!date) return null;
  return date.toISOString();
}

/**
 * Convert ISO 8601 string to Date
 */
export function toDate(isoString: string | null | undefined): Date | null {
  if (!isoString) return null;
  return new Date(isoString);
}
