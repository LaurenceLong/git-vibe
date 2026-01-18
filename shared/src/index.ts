/**
 * GitVibe Shared Types Package
 *
 * This package provides shared TypeScript types and Zod validation schemas
 * for use across the backend and frontend applications.
 *
 * All date fields use ISO 8601 string format for API compatibility.
 */

// ============================================================================
// Codec Schemas
// ============================================================================

export { zIsoDateTimeString, zIsoDateTimeNullable } from './codec/datetime.js';

// ============================================================================
// Common Types
// ============================================================================

export type { ErrorResponse, SuccessResponse, PaginatedResponse } from './types/common.js';

export {
  ErrorResponseSchema,
  createSuccessResponseSchema,
  createPaginatedResponseSchema,
} from './types/common.js';

// ============================================================================
// Model Types
// ============================================================================

export type {
  WorkItem,
  WorkItemType,
  WorkItemStatus,
  WorkspaceStatus,
  Project,
  TargetRepo,
  PullRequest,
  PullRequestStatus,
  MergeStrategy,
  ReviewThread,
  ReviewThreadStatus,
  ReviewThreadSeverity,
  ReviewComment,
  AgentRun,
  AgentRunStatus,
  AgentKey,
  RepoFile,
  Commit,
  CommitWithTask,
  AgentModel,
  AgentParams,
  // Schema-first DTO types (inferred from Zod schemas)
  WorkItemDTO,
  ProjectDTO,
  TargetRepoDTO,
  PullRequestDTO,
  ReviewThreadDTO,
  ReviewCommentDTO,
  AgentRunDTO,
} from './types/models.js';

export {
  WorkItemTypeSchema,
  WorkItemStatusSchema,
  WorkspaceStatusSchema,
  PullRequestStatusSchema,
  MergeStrategySchema,
  AgentRunStatusSchema,
  ReviewThreadStatusSchema,
  ReviewThreadSeveritySchema,
  AgentKeySchema,
  WorkItemSchema,
  ProjectSchema,
  TargetRepoSchema,
  PullRequestSchema,
  ReviewThreadSchema,
  ReviewCommentSchema,
  AgentRunSchema,
  RepoFileSchema,
  CommitSchema,
  CommitWithTaskSchema,
  AgentModelSchema,
  AgentParamsSchema,
} from './types/models.js';

// ============================================================================
// Request DTOs
// ============================================================================

export type {
  CreateProjectDTO,
  UpdateProjectDTO,
  TriggerAgentRunDTO,
  CreateThreadDTO,
  AddressWithAgentDTO,
  CreateCommentDTO,
  CreateTargetRepoDTO,
  CreateWorkItemDTO,
  UpdateWorkItemDTO,
  RemoveWorktreeDTO,
} from './types/requests.js';

export {
  CreateProjectDTOSchema,
  UpdateProjectDTOSchema,
  TriggerAgentRunDTOSchema,
  CreateThreadDTOSchema,
  AddressWithAgentDTOSchema,
  CreateCommentDTOSchema,
  CreateTargetRepoDTOSchema,
  CreateWorkItemDTOSchema,
  UpdateWorkItemDTOSchema,
  RemoveWorktreeDTOSchema,
} from './types/requests.js';

// ============================================================================
// Response DTOs
// ============================================================================

export type {
  ModelsResponse,
  FilesResponse,
  FileContentResponse,
  BranchesResponse,
  SyncResponse,
  DiffResponse,
  CancelAgentRunResponse,
  RemoveWorktreeResponse,
  DeleteProjectResponse,
  ResolveThreadResponse,
  UnresolveThreadResponse,
} from './types/responses.js';

export {
  ModelsResponseSchema,
  FilesResponseSchema,
  FileContentResponseSchema,
  BranchesResponseSchema,
  SyncResponseSchema,
  DiffResponseSchema,
  CancelAgentRunResponseSchema,
  RemoveWorktreeResponseSchema,
  DeleteProjectResponseSchema,
  ResolveThreadResponseSchema,
  UnresolveThreadResponseSchema,
} from './types/responses.js';
