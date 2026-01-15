/**
 * Response DTOs (Data Transfer Objects) for API responses
 * These types define the structure of response payloads
 */

import { z } from 'zod';
import type { AgentModel, RepoFile } from './models.js';
import { AgentModelSchema, RepoFileSchema } from './models.js';

// ============================================================================
// Models Response
// ============================================================================

/**
 * Response for listing available agent models
 */
export interface ModelsResponse {
  data: AgentModel[];
}

/**
 * Zod schema for ModelsResponse validation
 */
export const ModelsResponseSchema = z.object({
  data: z.array(AgentModelSchema),
});

// ============================================================================
// Files Response
// ============================================================================

/**
 * Response for listing repository files
 */
export interface FilesResponse {
  data: RepoFile[];
}

/**
 * Zod schema for FilesResponse validation
 */
export const FilesResponseSchema = z.object({
  data: z.array(RepoFileSchema),
});

// ============================================================================
// File Content Response
// ============================================================================

/**
 * Response for getting file content
 */
export interface FileContentResponse {
  data: {
    path: string;
    content: string;
  };
}

/**
 * Zod schema for FileContentResponse validation
 */
export const FileContentResponseSchema = z.object({
  data: z.object({
    path: z.string(),
    content: z.string(),
  }),
});

// ============================================================================
// Branches Response
// ============================================================================

/**
 * Response for listing repository branches
 */
export interface BranchesResponse {
  data: string[];
  defaultBranch: string;
}

/**
 * Zod schema for BranchesResponse validation
 */
export const BranchesResponseSchema = z.object({
  data: z.array(z.string()),
  defaultBranch: z.string(),
});

// ============================================================================
// Sync Response
// ============================================================================

/**
 * Response for project sync operation
 */
export interface SyncResponse {
  success: boolean;
  message: string;
}

/**
 * Zod schema for SyncResponse validation
 */
export const SyncResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

// ============================================================================
// Diff Response
// ============================================================================

/**
 * Response for getting diff
 */
export interface DiffResponse {
  diff: string;
  baseSha: string;
  headSha: string;
}

/**
 * Zod schema for DiffResponse validation
 */
export const DiffResponseSchema = z.object({
  diff: z.string(),
  baseSha: z.string(),
  headSha: z.string(),
});

// ============================================================================
// Import Response
// ============================================================================

/**
 * Response for import operation
 */
export interface ImportResponse {
  message: string;
  import: {
    id: string;
    changesetId: string;
    targetRepoId: string;
    status: string;
    sourceBaseSha: string;
    sourceHeadSha: string;
    targetBaseSha: string | null;
    targetResultSha: string | null;
    log: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
}

/**
 * Zod schema for ImportResponse validation
 */
export const ImportResponseSchema = z.object({
  message: z.string(),
  import: z.object({
    id: z.string(),
    changesetId: z.string(),
    targetRepoId: z.string(),
    status: z.string(),
    sourceBaseSha: z.string(),
    sourceHeadSha: z.string(),
    targetBaseSha: z.string().nullable(),
    targetResultSha: z.string().nullable(),
    log: z.string().nullable(),
    startedAt: z.string().nullable(),
    finishedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
});

// ============================================================================
// Cancel Agent Run Response
// ============================================================================

/**
 * Response for canceling an agent run
 */
export interface CancelAgentRunResponse {
  message: string;
  id: string;
  agentRun: {
    id: string;
    changesetId: string;
    agentKey: string;
    status: string;
    inputSummary: string | null;
    inputJson: string;
    log: string | null;
    logPath: string | null;
    headShaBefore: string | null;
    headShaAfter: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
}

/**
 * Zod schema for CancelAgentRunResponse validation
 */
export const CancelAgentRunResponseSchema = z.object({
  message: z.string(),
  id: z.string(),
  agentRun: z.object({
    id: z.string(),
    changesetId: z.string(),
    agentKey: z.string(),
    status: z.string(),
    inputSummary: z.string().nullable(),
    inputJson: z.string(),
    log: z.string().nullable(),
    logPath: z.string().nullable(),
    headShaBefore: z.string().nullable(),
    headShaAfter: z.string().nullable(),
    startedAt: z.string().nullable(),
    finishedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
});

// ============================================================================
// Worktree Status Response
// ============================================================================

/**
 * Response for worktree status check
 */
export interface WorktreeStatusResponse {
  status: 'present' | 'missing' | 'recreating';
  worktreePath: string;
}

/**
 * Zod schema for WorktreeStatusResponse validation
 */
export const WorktreeStatusResponseSchema = z.object({
  status: z.enum(['present', 'missing', 'recreating']),
  worktreePath: z.string(),
});

// ============================================================================
// Remove Worktree Response
// ============================================================================

/**
 * Response for removing a worktree
 */
export interface RemoveWorktreeResponse {
  success: boolean;
  message: string;
}

/**
 * Zod schema for RemoveWorktreeResponse validation
 */
export const RemoveWorktreeResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

// ============================================================================
// Refresh Changeset Response
// ============================================================================

/**
 * Response for refreshing a changeset
 */
export interface RefreshChangesetResponse {
  id: string;
  projectId: string;
  workItemId: string | null;
  title: string;
  body: string | null;
  status: string;
  prStatus: string | null;
  baseBranch: string;
  baseSha: string;
  branchName: string;
  headSha: string | null;
  worktreePath: string;
  mergedAt: string | null;
  closedAt: string | null;
  syncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Zod schema for RefreshChangesetResponse validation
 */
export const RefreshChangesetResponseSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  workItemId: z.string().nullable(),
  title: z.string(),
  body: z.string().nullable(),
  status: z.string(),
  prStatus: z.string().nullable(),
  baseBranch: z.string(),
  baseSha: z.string(),
  branchName: z.string(),
  headSha: z.string().nullable(),
  worktreePath: z.string(),
  mergedAt: z.string().nullable(),
  closedAt: z.string().nullable(),
  syncedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ============================================================================
// Close Changeset Response
// ============================================================================

/**
 * Response for closing a changeset
 */
export interface CloseChangesetResponse {
  id: string;
  projectId: string;
  workItemId: string | null;
  title: string;
  body: string | null;
  status: string;
  prStatus: string | null;
  baseBranch: string;
  baseSha: string;
  branchName: string;
  headSha: string | null;
  worktreePath: string;
  mergedAt: string | null;
  closedAt: string | null;
  syncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Zod schema for CloseChangesetResponse validation
 */
export const CloseChangesetResponseSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  workItemId: z.string().nullable(),
  title: z.string(),
  body: z.string().nullable(),
  status: z.string(),
  prStatus: z.string().nullable(),
  baseBranch: z.string(),
  baseSha: z.string(),
  branchName: z.string(),
  headSha: z.string().nullable(),
  worktreePath: z.string(),
  mergedAt: z.string().nullable(),
  closedAt: z.string().nullable(),
  syncedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ============================================================================
// Delete Project Response
// ============================================================================

/**
 * Response for deleting a project
 */
export interface DeleteProjectResponse {
  success: boolean;
  message: string;
}

/**
 * Zod schema for DeleteProjectResponse validation
 */
export const DeleteProjectResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

// ============================================================================
// Resolve Thread Response
// ============================================================================

/**
 * Response for resolving a review thread
 */
export interface ResolveThreadResponse {
  id: string;
  changesetId: string;
  status: string;
  severity: string;
  anchor: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Zod schema for ResolveThreadResponse validation
 */
export const ResolveThreadResponseSchema = z.object({
  id: z.string(),
  changesetId: z.string(),
  status: z.string(),
  severity: z.string(),
  anchor: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ============================================================================
// Unresolve Thread Response
// ============================================================================

/**
 * Response for unresolving a review thread
 */
export interface UnresolveThreadResponse {
  id: string;
  changesetId: string;
  status: string;
  severity: string;
  anchor: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Zod schema for UnresolveThreadResponse validation
 */
export const UnresolveThreadResponseSchema = z.object({
  id: z.string(),
  changesetId: z.string(),
  status: z.string(),
  severity: z.string(),
  anchor: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
