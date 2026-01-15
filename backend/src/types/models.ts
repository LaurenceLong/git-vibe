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
  ChangeSet as SharedChangeSet,
  ReviewThread as SharedReviewThread,
  ReviewComment as SharedReviewComment,
  AgentRun as SharedAgentRun,
  Import as SharedImport,
  AgentParams as SharedAgentParams,
  WorkItemType,
  WorkItemStatus,
  PRStatus,
  WorktreeStatus,
  ChangeSetStatus,
  AgentRunStatus,
  ImportStatus,
  ImportStrategy,
  ReviewThreadStatus,
  ReviewThreadSeverity,
  AgentKey,
} from 'git-vibe-shared';

// ============================================================================
// Backend Types (with Date objects for internal use)
// ============================================================================

export type WorkItem = Omit<SharedWorkItem, 'createdAt' | 'updatedAt'> & {
  createdAt: Date;
  updatedAt: Date;
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

export type ChangeSet = Omit<SharedChangeSet, 'createdAt' | 'updatedAt' | 'mergedAt' | 'closedAt' | 'syncedAt'> & {
  createdAt: Date;
  updatedAt: Date;
  mergedAt: Date | null;
  closedAt: Date | null;
  syncedAt: Date | null;
};

export type ReviewThread = Omit<SharedReviewThread, 'createdAt' | 'updatedAt'> & {
  createdAt: Date;
  updatedAt: Date;
};

export type ReviewComment = Omit<SharedReviewComment, 'createdAt'> & {
  createdAt: Date;
};

export type AgentRun = Omit<SharedAgentRun, 'createdAt' | 'updatedAt' | 'startedAt' | 'finishedAt'> & {
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};

export type Import = Omit<SharedImport, 'createdAt' | 'updatedAt' | 'startedAt' | 'finishedAt'> & {
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
  PRStatus,
  WorktreeStatus,
  ChangeSetStatus,
  AgentRunStatus,
  ImportStatus,
  ImportStrategy,
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
export type ToShared<T extends { createdAt: Date; updatedAt: Date }> = Omit<T, 'createdAt' | 'updatedAt' | 'mergedAt' | 'closedAt' | 'syncedAt' | 'startedAt' | 'finishedAt'> & {
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
