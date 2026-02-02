/**
 * Status constants for resources
 * These constants ensure consistent status values across the codebase
 */

// PullRequest status values
export const PR_STATUS_OPEN = 'open';
export const PR_STATUS_MERGED = 'merged';
export const PR_STATUS_CLOSED = 'closed';

// WorkItem status values
export const WORKITEM_STATUS_OPEN = 'open';
export const WORKITEM_STATUS_CLOSED = 'closed';

// Workspace status values
export const WORKSPACE_STATUS_NOT_INITIALIZED = 'not_initialized';
export const WORKSPACE_STATUS_READY = 'ready';
export const WORKSPACE_STATUS_ERROR = 'error';

// AgentRun status values
export const AGENT_RUN_STATUS_QUEUED = 'queued';
export const AGENT_RUN_STATUS_RUNNING = 'running';
export const AGENT_RUN_STATUS_SUCCEEDED = 'succeeded';
export const AGENT_RUN_STATUS_FAILED = 'failed';
export const AGENT_RUN_STATUS_CANCELED = 'cancelled';

// Resource result status values (used by ResourceDispatcher)
export const RESOURCE_STATUS_SUCCEEDED = 'succeeded';
export const RESOURCE_STATUS_FAILED = 'failed';
export const RESOURCE_STATUS_CANCELED = 'canceled';

// WorkflowRun status values
export const WORKFLOW_RUN_STATUS_PENDING = 'pending';
export const WORKFLOW_RUN_STATUS_RUNNING = 'running';
export const WORKFLOW_RUN_STATUS_SUCCEEDED = 'succeeded';
export const WORKFLOW_RUN_STATUS_FAILED = 'failed';
export const WORKFLOW_RUN_STATUS_BLOCKED = 'blocked';
export const WORKFLOW_RUN_STATUS_SKIPPED = 'skipped';

// NodeRun status values
export const NODE_RUN_STATUS_PENDING = 'pending';
export const NODE_RUN_STATUS_RUNNING = 'running';
export const NODE_RUN_STATUS_SUCCEEDED = 'succeeded';
export const NODE_RUN_STATUS_FAILED = 'failed';
export const NODE_RUN_STATUS_CANCELED = 'canceled';
export const NODE_RUN_STATUS_BLOCKED = 'blocked';
