/**
 * Model types representing database entities
 * All date fields use ISO 8601 string format for API compatibility
 */

import { z } from 'zod';
import { zIsoDateTimeString, zIsoDateTimeNullable } from '../codec/datetime.js';

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
 * Workspace status
 */
export type WorkspaceStatus = 'not_initialized' | 'ready' | 'error';

/**
 * PullRequest status
 */
export type PullRequestStatus = 'open' | 'merged' | 'closed';

/**
 * Merge strategy
 */
export type MergeStrategy = 'merge' | 'squash' | 'rebase';

/**
 * AgentRun status
 */
export type AgentRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

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
export const WorkspaceStatusSchema = z.enum(['not_initialized', 'ready', 'error']);
export const PullRequestStatusSchema = z.enum(['open', 'merged', 'closed']);
export const MergeStrategySchema = z.enum(['merge', 'squash', 'rebase']);
export const AgentRunStatusSchema = z.enum([
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
]);
export const ReviewThreadStatusSchema = z.enum(['open', 'resolved', 'outdated']);
export const ReviewThreadSeveritySchema = z.enum(['info', 'warning', 'error']);
export const AgentKeySchema = z.enum(['opencode', 'claudcode']);

// ============================================================================
// Model Types
// ============================================================================

/**
 * WorkItem represents an Issue or Feature Request
 * WorkItems own workspaces (worktree + branch) for agent execution
 */
export interface WorkItem {
  id: string;
  projectId: string;
  type: WorkItemType;
  title: string;
  body: string | null;
  status: WorkItemStatus;
  // Workspace fields
  workspaceStatus: WorkspaceStatus;
  worktreePath: string | null;
  headBranch: string | null;
  baseBranch: string | null;
  baseSha: string | null;
  headSha: string | null;
  // Locking fields for serialized agent runs
  lockOwnerRunId: string | null;
  lockExpiresAt: string | null; // ISO 8601
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
  workspaceStatus: WorkspaceStatusSchema,
  worktreePath: z.string().nullable(),
  headBranch: z.string().nullable(),
  baseBranch: z.string().nullable(),
  baseSha: z.string().nullable(),
  headSha: z.string().nullable(),
  lockOwnerRunId: z.string().nullable(),
  lockExpiresAt: zIsoDateTimeNullable,
  createdAt: zIsoDateTimeString,
  updatedAt: zIsoDateTimeString,
});

/**
 * Project represents a source project
 */
export interface Project {
  id: string;
  name: string;
  sourceRepoPath: string;
  sourceRepoUrl: string | null;
  mirrorRepoPath: string;
  relayRepoPath: string;
  defaultBranch: string;
  defaultAgent: AgentKey;
  agentParams: string | null; // JSON stringified
  maxAgentConcurrency: number; // Maximum concurrent agent tasks
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
  mirrorRepoPath: z.string(),
  relayRepoPath: z.string(),
  defaultBranch: z.string(),
  defaultAgent: AgentKeySchema,
  agentParams: z.string().nullable(), // JSON stringified
  maxAgentConcurrency: z.number(), // Maximum concurrent agent tasks
  createdAt: zIsoDateTimeString,
  updatedAt: zIsoDateTimeString,
});

/**
 * PullRequest represents a pull request for a WorkItem
 */
export interface PullRequest {
  id: string;
  projectId: string;
  workItemId: string;
  title: string;
  description: string | null;
  status: PullRequestStatus;
  sourceBranch: string;
  targetBranch: string;
  mergeStrategy: MergeStrategy;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  mergedAt: string | null; // ISO 8601
  mergedBy: string | null;
  mergeCommitSha: string | null;
  syncedCommitSha: string | null; // Commit SHA in source repo after sync
}

/**
 * Zod schema for PullRequest validation
 */
export const PullRequestSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  workItemId: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  status: PullRequestStatusSchema,
  sourceBranch: z.string(),
  targetBranch: z.string(),
  mergeStrategy: MergeStrategySchema,
  createdAt: zIsoDateTimeString,
  updatedAt: zIsoDateTimeString,
  mergedAt: zIsoDateTimeNullable,
  mergedBy: z.string().nullable(),
  mergeCommitSha: z.string().nullable(),
  syncedCommitSha: z.string().nullable(),
});

/**
 * ReviewThread represents a review thread on a pull request
 */
export interface ReviewThread {
  id: string;
  pullRequestId: string;
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
  pullRequestId: z.string().uuid(),
  status: ReviewThreadStatusSchema,
  severity: ReviewThreadSeveritySchema,
  anchor: z.string(), // JSON stringified
  createdAt: zIsoDateTimeString,
  updatedAt: zIsoDateTimeString,
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
  createdAt: zIsoDateTimeString,
});

/**
 * AgentRun represents an AI agent execution on a work item
 */
export interface AgentRun {
  id: string;
  projectId: string;
  workItemId: string;
  agentKey: AgentKey;
  status: AgentRunStatus;
  inputSummary: string | null;
  inputJson: string; // JSON stringified
  sessionId: string | null; // Agent session ID for resuming (null if no session available - task cannot be resumed)
  linkedAgentRunId: string | null; // ID of the original agent run if this is a resumed task
  log: string | null;
  logPath: string | null;
  stdoutPath: string | null; // Path to stdout log file
  stderrPath: string | null; // Path to stderr log file
  headShaBefore: string | null;
  headShaAfter: string | null;
  commitSha: string | null; // The auto-commit SHA if created
  pid: number | null; // Process ID for tracking running processes
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
  projectId: z.string().uuid(),
  workItemId: z.string().uuid(),
  agentKey: AgentKeySchema,
  status: AgentRunStatusSchema,
  inputSummary: z.string().nullable(),
  inputJson: z.string(), // JSON stringified
  sessionId: z.string().nullable(), // Agent session ID for resuming (null if no session available - task cannot be resumed)
  linkedAgentRunId: z.string().uuid().nullable(), // ID of the original agent run if this is a resumed task
  log: z.string().nullable(),
  logPath: z.string().nullable(),
  stdoutPath: z.string().nullable(), // Path to stdout log file
  stderrPath: z.string().nullable(), // Path to stderr log file
  headShaBefore: z.string().nullable(),
  headShaAfter: z.string().nullable(),
  commitSha: z.string().nullable(), // The auto-commit SHA if created
  pid: z.number().nullable(), // Process ID for tracking running processes
  startedAt: zIsoDateTimeNullable,
  finishedAt: zIsoDateTimeNullable,
  createdAt: zIsoDateTimeString,
  updatedAt: zIsoDateTimeString,
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
 * Commit represents a git commit
 */
export interface Commit {
  sha: string;
  message: string;
  author: string;
  date: string; // ISO 8601 or git date format
  filesChanged: string[];
}

/**
 * Zod schema for Commit validation
 */
export const CommitSchema = z.object({
  sha: z.string(),
  message: z.string(),
  author: z.string(),
  date: z.string(),
  filesChanged: z.array(z.string()),
});

/**
 * CommitWithTask represents a group of commits associated with a task
 */
export interface CommitWithTask {
  task: AgentRun | null;
  commits: Commit[];
}

/**
 * Zod schema for CommitWithTask validation
 */
export const CommitWithTaskSchema = z.object({
  task: AgentRunSchema.nullable(),
  commits: z.array(CommitSchema),
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

// ============================================================================
// Schema-First Inferred Types
// ============================================================================

/**
 * Inferred type from WorkItemSchema
 * Use this for type-safe data validated against WorkItemSchema
 */
export type WorkItemDTO = z.infer<typeof WorkItemSchema>;

/**
 * Inferred type from ProjectSchema
 * Use this for type-safe data validated against ProjectSchema
 */
export type ProjectDTO = z.infer<typeof ProjectSchema>;

/**
 * Inferred type from PullRequestSchema
 * Use this for type-safe data validated against PullRequestSchema
 */
export type PullRequestDTO = z.infer<typeof PullRequestSchema>;

/**
 * Inferred type from ReviewThreadSchema
 * Use this for type-safe data validated against ReviewThreadSchema
 */
export type ReviewThreadDTO = z.infer<typeof ReviewThreadSchema>;

/**
 * Inferred type from ReviewCommentSchema
 * Use this for type-safe data validated against ReviewCommentSchema
 */
export type ReviewCommentDTO = z.infer<typeof ReviewCommentSchema>;

/**
 * Inferred type from AgentRunSchema
 * Use this for type-safe data validated against AgentRunSchema
 */
export type AgentRunDTO = z.infer<typeof AgentRunSchema>;
