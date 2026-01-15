/**
 * GitVibe Shared Types Package
 *
 * This package provides shared TypeScript types and Zod validation schemas
 * for use across the backend and frontend applications.
 *
 * All date fields use ISO 8601 string format for API compatibility.
 */

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
  Import,
  ImportStatus,
  ImportStrategy,
  RepoFile,
  AgentModel,
  AgentParams,
} from './types/models.js';

export {
  WorkItemTypeSchema,
  WorkItemStatusSchema,
  WorkspaceStatusSchema,
  PullRequestStatusSchema,
  MergeStrategySchema,
  AgentRunStatusSchema,
  ImportStatusSchema,
  ImportStrategySchema,
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
  ImportSchema,
  RepoFileSchema,
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
  CreateImportDTO,
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
  CreateImportDTOSchema,
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
  ImportResponse,
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
  ImportResponseSchema,
  CancelAgentRunResponseSchema,
  RemoveWorktreeResponseSchema,
  DeleteProjectResponseSchema,
  ResolveThreadResponseSchema,
  UnresolveThreadResponseSchema,
} from './types/responses.js';
