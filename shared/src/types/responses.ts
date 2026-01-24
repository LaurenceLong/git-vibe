/**
 * Response DTOs (Data Transfer Objects) for API responses
 * These types define the structure of response payloads
 */

import { z } from 'zod';
import type { AgentModel, RepoFile } from './models.js';
import { AgentModelSchema, RepoFileSchema } from './models.js';
import { ProjectSchema, WorkItemSchema, PullRequestSchema } from './models.js';

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
    content: string | null;
    isBinary?: boolean;
    size?: number;
  };
}

/**
 * Zod schema for FileContentResponse validation
 */
export const FileContentResponseSchema = z.object({
  data: z.object({
    path: z.string(),
    content: z.string().nullable(),
    isBinary: z.boolean().optional(),
    size: z.number().optional(),
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
  currentBranch?: string;
}

/**
 * Zod schema for BranchesResponse validation
 */
export const BranchesResponseSchema = z.object({
  data: z.array(z.string()),
  defaultBranch: z.string(),
  currentBranch: z.string().optional(),
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
    workItemId: string;
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
    workItemId: z.string(),
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
  pullRequestId: string;
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
  pullRequestId: z.string(),
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
  pullRequestId: string;
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
  pullRequestId: z.string(),
  status: z.string(),
  severity: z.string(),
  anchor: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ============================================================================
// Project Statistics (for /api/projects?includeStats=true)
// ============================================================================

export const ProjectStatsSchema = z.object({
  workItems: z.number(),
  openWorkItems: z.number(),
  pullRequests: z.number(),
  openPullRequests: z.number(),
});

export type ProjectStatsDTO = z.infer<typeof ProjectStatsSchema>;

// ============================================================================
// Projects List Response (paginated projects with optional stats)
// ============================================================================

export const ProjectsListResponseSchema = z
  .object({
    data: z.array(ProjectSchema),
    pagination: z.object({
      page: z.number(),
      limit: z.number(),
      total: z.number(),
      totalPages: z.number(),
    }),
  })
  .extend({
    statistics: z.record(z.string(), ProjectStatsSchema).optional(),
  });

export type ProjectsListResponseDTO = z.infer<typeof ProjectsListResponseSchema>;

// ============================================================================
// Search Response (GET /api/search)
// ============================================================================

export const SearchResponseSchema = z.object({
  projects: z.array(ProjectSchema),
  workItems: z.array(WorkItemSchema),
  pullRequests: z.array(PullRequestSchema),
  projectNames: z.record(z.string(), z.string()),
});

export type SearchResponseDTO = z.infer<typeof SearchResponseSchema>;

// ============================================================================
// Workflow Response
// ============================================================================

export interface WorkflowResponse {
  data: {
    id: string;
    name: string;
    description: string;
    definition: any;
    isDefault: boolean;
    createdAt: string;
    updatedAt: string;
  };
}

export const WorkflowResponseSchema = z.object({
  data: z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    definition: z.any(),
    isDefault: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
});

export interface WorkflowRunResponse {
  data: {
    id: string;
    workflowId: string;
    workItemId: string;
    status: 'pending' | 'running' | 'succeeded' | 'failed' | 'blocked' | 'skipped';
    currentStepId: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    createdAt: string;
  };
}

export const WorkflowRunResponseSchema = z.object({
  data: z.object({
    id: z.string(),
    workflowId: z.string(),
    workItemId: z.string(),
    status: z.enum(['pending', 'running', 'succeeded', 'failed', 'blocked', 'skipped']),
    currentStepId: z.string().nullable(),
    startedAt: z.string().nullable(),
    finishedAt: z.string().nullable(),
    createdAt: z.string(),
  }),
});

// ============================================================================
// Workflow List Item (for paginated /api/workflows)
// ============================================================================

export interface WorkflowListItem {
  id: string;
  name: string;
  description?: string;
  definition: any;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export const WorkflowListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  definition: z.any(),
  isDefault: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
