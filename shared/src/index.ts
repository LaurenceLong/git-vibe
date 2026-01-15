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
  Project,
  TargetRepo,
  ChangeSet,
  ChangeSetStatus,
  PRStatus,
  WorktreeStatus,
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
  PRStatusSchema,
  WorktreeStatusSchema,
  ChangeSetStatusSchema,
  AgentRunStatusSchema,
  ImportStatusSchema,
  ImportStrategySchema,
  ReviewThreadStatusSchema,
  ReviewThreadSeveritySchema,
  AgentKeySchema,
  WorkItemSchema,
  ProjectSchema,
  TargetRepoSchema,
  ChangeSetSchema,
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
  CreateChangesetDTO,
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
  CreateChangesetDTOSchema,
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
  RefreshChangesetResponse,
  CloseChangesetResponse,
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
  RefreshChangesetResponseSchema,
  CloseChangesetResponseSchema,
  DeleteProjectResponseSchema,
  ResolveThreadResponseSchema,
  UnresolveThreadResponseSchema,
} from './types/responses.js';
