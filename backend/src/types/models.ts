import type {
  WorkItem as SharedWorkItem,
  Project as SharedProject,
  PullRequest as SharedPullRequest,
  ReviewThread as SharedReviewThread,
  ReviewComment as SharedReviewComment,
  Task as SharedTask,
  Worktree as SharedWorktree,
  GitOp as SharedGitOp,
  AgentRun as SharedAgentRun,
  AgentParams as SharedAgentParams,
  Workflow as SharedWorkflow,
  WorkflowRun as SharedWorkflowRun,
  NodeRun as SharedNodeRun,
  WorkItemType,
  WorkItemStatus,
  WorkspaceStatus,
  PullRequestStatus,
  AgentRunStatus,
  ReviewThreadStatus,
  ReviewThreadSeverity,
  AgentKey,
  NodeRunStatus,
} from 'git-vibe-shared';

export type WorkItem = Omit<SharedWorkItem, 'createdAt' | 'updatedAt' | 'lockExpiresAt'> & {
  createdAt: Date;
  updatedAt: Date;
  lockExpiresAt: Date | null;
};

export type AgentParams = SharedAgentParams;

export type Project = Omit<SharedProject, 'createdAt' | 'updatedAt'> & {
  createdAt: Date;
  updatedAt: Date;
};

export type PullRequest = Omit<SharedPullRequest, 'createdAt' | 'updatedAt' | 'mergedAt'> & {
  createdAt: Date;
  updatedAt: Date;
  mergedAt: Date | null;
};

export type ReviewThread = Omit<SharedReviewThread, 'createdAt' | 'updatedAt'> & {
  createdAt: Date;
  updatedAt: Date;
};

export type ReviewComment = Omit<SharedReviewComment, 'createdAt'> & {
  createdAt: Date;
};

export type Task = Omit<SharedTask, 'createdAt' | 'updatedAt'> & {
  createdAt: Date;
  updatedAt: Date;
};

export type Worktree = Omit<SharedWorktree, 'createdAt' | 'updatedAt'> & {
  createdAt: Date;
  updatedAt: Date;
};

export type GitOp = Omit<SharedGitOp, 'createdAt' | 'updatedAt'> & {
  createdAt: Date;
  updatedAt: Date;
};

export type AgentRun = Omit<
  SharedAgentRun,
  'createdAt' | 'updatedAt' | 'startedAt' | 'finishedAt'
> & {
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  nodeRunId: string | null; // Link to NodeRun that started this AgentRun
};

export type Workflow = SharedWorkflow;

export type WorkflowRun = Omit<SharedWorkflowRun, 'createdAt' | 'startedAt' | 'finishedAt'> & {
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};

export type NodeRun = Omit<SharedNodeRun, 'startedAt' | 'finishedAt'> & {
  startedAt: Date | null;
  finishedAt: Date | null;
};

export type {
  WorkItemType,
  WorkItemStatus,
  WorkspaceStatus,
  PullRequestStatus,
  AgentRunStatus,
  ReviewThreadStatus,
  ReviewThreadSeverity,
  AgentKey,
  NodeRunStatus,
};

export type ToShared<T extends { createdAt: Date; updatedAt: Date }> = Omit<
  T,
  'createdAt' | 'updatedAt' | 'mergedAt' | 'closedAt' | 'syncedAt' | 'startedAt' | 'finishedAt'
> & {
  createdAt: string;
  updatedAt: string;
  mergedAt?: string | null;
  closedAt?: string | null;
  syncedAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
};

export function toISOString(date: Date | null | undefined): string | null {
  if (!date) return null;
  return date.toISOString();
}

export function toDate(isoString: string | null | undefined): Date | null {
  if (!isoString) return null;
  return new Date(isoString);
}
