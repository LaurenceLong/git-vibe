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
  CreateWorkItemDTO,
  UpdateWorkItemDTO,
  RemoveWorktreeDTO,
  CreateFileDTO,
  UpdateFileDTO,
  DeleteFileDTO,
  CommitChangesDTO,
  GetOrCreateManualWorkItemDTO,
  CreateWorkflowDTO,
  UpdateWorkflowDTO,
  ExecuteWorkflowDTO,
} from './types/requests.js';

export {
  CreateProjectDTOSchema,
  UpdateProjectDTOSchema,
  TriggerAgentRunDTOSchema,
  CreateThreadDTOSchema,
  AddressWithAgentDTOSchema,
  CreateCommentDTOSchema,
  CreateWorkItemDTOSchema,
  UpdateWorkItemDTOSchema,
  RemoveWorktreeDTOSchema,
  CreateFileDTOSchema,
  UpdateFileDTOSchema,
  DeleteFileDTOSchema,
  CommitChangesDTOSchema,
  GetOrCreateManualWorkItemDTOSchema,
  CreateWorkflowDTOSchema,
  UpdateWorkflowDTOSchema,
  ExecuteWorkflowDTOSchema,
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
  ProjectStatsDTO,
  ProjectsListResponseDTO,
  SearchResponseDTO,
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
  ProjectStatsSchema,
  ProjectsListResponseSchema,
  SearchResponseSchema,
  WorkflowResponseSchema,
  WorkflowListItemSchema,
  WorkflowRunResponseSchema,
} from './types/responses.js';

export type {
  WorkflowNodeType,
  SessionMode,
  TransitionTrigger,
  StepStatus,
  Workflow,
  WorkflowNode,
  Slot,
  ExtensionNode,
  Extensions,
  Transition,
  SyncRule,
  SyncConfig,
  Control,
  WorkflowPolicy,
  WorkflowContext,
  PromptsConfig,
  WorkflowRun,
  StepExecution,
  WorkflowDTO,
  WorkflowRunDTO,
  StepExecutionDTO,
} from './types/workflow.js';

export {
  WorkflowNodeTypeSchema,
  SessionModeSchema,
  TransitionTriggerSchema,
  WorkflowNodeSchema,
  SlotSchema,
  ExtensionsSchema,
  TransitionSchema,
  SyncRuleSchema,
  SyncConfigSchema,
  ControlSchema,
  WorkflowPolicySchema,
  WorkflowContextSchema,
  PromptsConfigSchema,
  WorkflowSchema,
  StepStatusSchema,
  WorkflowRunSchema,
  StepExecutionSchema,
} from './types/workflow.js';
