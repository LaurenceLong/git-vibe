/**
 * Model types representing database entities
 * All date fields use ISO 8601 string format for API compatibility
 */

import { z } from 'zod';

// ============================================================================
// Enums
// ============================================================================

/**
 * WorkItem type (issue or feature request)
 */
export type WorkItemType = 'issue' | 'feature-request';

/**
 * WorkItem status
 */
export type WorkItemStatus = 'open' | 'closed';

/**
 * PR status
 */
export type PRStatus = 'open' | 'merged' | 'closed';

/**
 * Worktree status
 */
export type WorktreeStatus = 'present' | 'missing' | 'recreating';

/**
 * ChangeSet status
 */
export type ChangeSetStatus = 'draft' | 'active' | 'completed' | 'cancelled';

/**
 * AgentRun status
 */
export type AgentRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

/**
 * Import status
 */
export type ImportStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'succeeded_noop'
  | 'failed'
  | 'failed_dirty'
  | 'failed_conflict'
  | 'failed_other';

/**
 * Import strategy
 */
export type ImportStrategy = 'patch';

/**
 * ReviewThread status
 */
export type ReviewThreadStatus = 'open' | 'resolved' | 'outdated';

/**
 * ReviewThread severity
 */
export type ReviewThreadSeverity = 'info' | 'warning' | 'error';

/**
 * Agent key
 */
export type AgentKey = 'opencode' | 'claudcode';

// ============================================================================
// Zod Schemas for Enums
// ============================================================================

export const WorkItemTypeSchema = z.enum(['issue', 'feature-request']);
export const WorkItemStatusSchema = z.enum(['open', 'closed']);
export const PRStatusSchema = z.enum(['open', 'merged', 'closed']);
export const WorktreeStatusSchema = z.enum(['present', 'missing', 'recreating']);
export const ChangeSetStatusSchema = z.enum(['draft', 'active', 'completed', 'cancelled']);
export const AgentRunStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']);
export const ImportStatusSchema = z.enum([
  'pending',
  'running',
  'succeeded',
  'succeeded_noop',
  'failed',
  'failed_dirty',
  'failed_conflict',
  'failed_other',
]);
export const ImportStrategySchema = z.enum(['patch']);
export const ReviewThreadStatusSchema = z.enum(['open', 'resolved', 'outdated']);
export const ReviewThreadSeveritySchema = z.enum(['info', 'warning', 'error']);
export const AgentKeySchema = z.enum(['opencode', 'claudcode']);

// ============================================================================
// Model Types
// ============================================================================

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
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/**
 * Zod schema for WorkItem validation
 */
export const WorkItemSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  type: WorkItemTypeSchema,
  title: z.string(),
  body: z.string().nullable(),
  status: WorkItemStatusSchema,
  createdAt: z.string(), // ISO 8601
  updatedAt: z.string(), // ISO 8601
});

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
  defaultAgent: AgentKey;
  agentParams: string | null; // JSON stringified
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/**
 * Zod schema for Project validation
 */
export const ProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  sourceRepoPath: z.string(),
  sourceRepoUrl: z.string().nullable(),
  relayRepoPath: z.string(),
  defaultBranch: z.string(),
  defaultAgent: AgentKeySchema,
  agentParams: z.string().nullable(), // JSON stringified
  createdAt: z.string(), // ISO 8601
  updatedAt: z.string(), // ISO 8601
});

/**
 * TargetRepo represents a target repository for imports
 */
export interface TargetRepo {
  id: string;
  name: string;
  repoPath: string;
  defaultBranch: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/**
 * Zod schema for TargetRepo validation
 */
export const TargetRepoSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  repoPath: z.string(),
  defaultBranch: z.string(),
  createdAt: z.string(), // ISO 8601
  updatedAt: z.string(), // ISO 8601
});

/**
 * ChangeSet represents a set of changes in a project
 */
export interface ChangeSet {
  id: string;
  projectId: string;
  workItemId: string | null;
  title: string;
  body: string | null;
  status: ChangeSetStatus;
  prStatus: PRStatus | null;
  baseBranch: string;
  baseSha: string;
  branchName: string;
  headSha: string | null;
  worktreePath: string;
  mergedAt: string | null; // ISO 8601
  closedAt: string | null; // ISO 8601
  syncedAt: string | null; // ISO 8601
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/**
 * Zod schema for ChangeSet validation
 */
export const ChangeSetSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  workItemId: z.string().uuid().nullable(),
  title: z.string(),
  body: z.string().nullable(),
  status: ChangeSetStatusSchema,
  prStatus: PRStatusSchema.nullable(),
  baseBranch: z.string(),
  baseSha: z.string(),
  branchName: z.string(),
  headSha: z.string().nullable(),
  worktreePath: z.string(),
  mergedAt: z.string().nullable(),
  closedAt: z.string().nullable(),
  syncedAt: z.string().nullable(),
  createdAt: z.string(), // ISO 8601
  updatedAt: z.string(), // ISO 8601
});

/**
 * ReviewThread represents a review thread on a changeset
 */
export interface ReviewThread {
  id: string;
  changesetId: string;
  status: ReviewThreadStatus;
  severity: ReviewThreadSeverity;
  anchor: string; // JSON stringified anchor object
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/**
 * Zod schema for ReviewThread validation
 */
export const ReviewThreadSchema = z.object({
  id: z.string().uuid(),
  changesetId: z.string().uuid(),
  status: ReviewThreadStatusSchema,
  severity: ReviewThreadSeveritySchema,
  anchor: z.string(), // JSON stringified
  createdAt: z.string(), // ISO 8601
  updatedAt: z.string(), // ISO 8601
});

/**
 * ReviewComment represents a comment within a review thread
 */
export interface ReviewComment {
  id: string;
  threadId: string;
  body: string;
  createdAt: string; // ISO 8601
}

/**
 * Zod schema for ReviewComment validation
 */
export const ReviewCommentSchema = z.object({
  id: z.string().uuid(),
  threadId: z.string().uuid(),
  body: z.string(),
  createdAt: z.string(), // ISO 8601
});

/**
 * AgentRun represents an AI agent execution on a changeset
 */
export interface AgentRun {
  id: string;
  changesetId: string;
  agentKey: AgentKey;
  status: AgentRunStatus;
  inputSummary: string | null;
  inputJson: string; // JSON stringified
  log: string | null;
  logPath: string | null;
  headShaBefore: string | null;
  headShaAfter: string | null;
  startedAt: string | null; // ISO 8601
  finishedAt: string | null; // ISO 8601
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/**
 * Zod schema for AgentRun validation
 */
export const AgentRunSchema = z.object({
  id: z.string().uuid(),
  changesetId: z.string().uuid(),
  agentKey: AgentKeySchema,
  status: AgentRunStatusSchema,
  inputSummary: z.string().nullable(),
  inputJson: z.string(), // JSON stringified
  log: z.string().nullable(),
  logPath: z.string().nullable(),
  headShaBefore: z.string().nullable(),
  headShaAfter: z.string().nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  createdAt: z.string(), // ISO 8601
  updatedAt: z.string(), // ISO 8601
});

/**
 * Import represents importing changes to a target repository
 */
export interface Import {
  id: string;
  changesetId: string;
  targetRepoId: string;
  strategy: ImportStrategy;
  status: ImportStatus;
  sourceBaseSha: string;
  sourceHeadSha: string;
  targetBaseSha: string | null;
  targetResultSha: string | null;
  log: string | null;
  startedAt: string | null; // ISO 8601
  finishedAt: string | null; // ISO 8601
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/**
 * Zod schema for Import validation
 */
export const ImportSchema = z.object({
  id: z.string().uuid(),
  changesetId: z.string().uuid(),
  targetRepoId: z.string().uuid(),
  strategy: ImportStrategySchema,
  status: ImportStatusSchema,
  sourceBaseSha: z.string(),
  sourceHeadSha: z.string(),
  targetBaseSha: z.string().nullable(),
  targetResultSha: z.string().nullable(),
  log: z.string().nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  createdAt: z.string(), // ISO 8601
  updatedAt: z.string(), // ISO 8601
});

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
 * Zod schema for RepoFile validation
 */
export const RepoFileSchema = z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(['file', 'directory']),
  size: z.number().optional(),
});

/**
 * AgentModel represents an available AI model for agents
 */
export interface AgentModel {
  id: string;
  name: string;
  provider?: string;
}

/**
 * Zod schema for AgentModel validation
 */
export const AgentModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string().optional(),
});

/**
 * AgentParams type for flexible agent configuration
 * In model types, this is stored as a JSON string
 */
export interface AgentParams {
  model?: string;
  [key: string]: unknown;
}

/**
 * Zod schema for AgentParams validation
 */
export const AgentParamsSchema = z.record(z.unknown());
