export type WorkItem = {
  id: string;
  projectId: string;
  type: 'issue' | 'feature-request';
  title: string;
  body: string | null;
  status: 'open' | 'closed';
  branchName: string;
  baseSha: string;
  headSha: string | null;
  worktreePath: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Project = {
  id: string;
  name: string;
  sourceRepoPath: string;
  sourceRepoUrl: string | null;
  defaultBranch: string;
  createdAt: Date;
  updatedAt: Date;
};

export type TargetRepo = {
  id: string;
  name: string;
  repoPath: string;
  defaultBranch: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ChangeSet = {
  id: string;
  projectId: string;
  workItemId: string | null;
  title: string;
  body: string | null;
  status: 'draft' | 'active' | 'completed' | 'cancelled';
  prStatus: 'open' | 'merged' | 'closed' | null;
  baseBranch: string;
  baseSha: string;
  branchName: string;
  headSha: string | null;
  worktreePath: string;
  mergedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ReviewThread = {
  id: string;
  changesetId: string;
  status: 'open' | 'resolved' | 'outdated';
  severity: 'info' | 'warning' | 'error';
  anchor: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ReviewComment = {
  id: string;
  threadId: string;
  body: string;
  createdAt: Date;
};

export type AgentRun = {
  id: string;
  changesetId: string;
  agentKey: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  inputSummary: string | null;
  inputJson: string;
  log: string | null;
  logPath: string | null;
  headShaBefore: string | null;
  headShaAfter: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Import = {
  id: string;
  changesetId: string;
  targetRepoId: string;
  strategy: 'patch';
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  sourceBaseSha: string;
  sourceHeadSha: string;
  targetBaseSha: string | null;
  targetResultSha: string | null;
  log: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
