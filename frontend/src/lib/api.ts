import axios from 'axios';

const API_BASE_URL = '/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const projectsApi = {
  list: (page?: number, limit?: number) =>
    api.get('/projects', { params: { page, limit } }),
  get: (id: string) => api.get(`/projects/${id}`),
  getByName: (name: string) => api.get(`/projects/name/${name}`),
  create: (data: { name: string; sourceRepoPath: string; sourceRepoUrl?: string }) =>
    api.post('/projects', data),
  getBranches: (id: string) => api.get(`/projects/${id}/branches`),
};

export const targetReposApi = {
  list: () => api.get('/target-repos'),
  get: (id: string) => api.get(`/target-repos/${id}`),
  create: (data: { name: string; repoPath: string }) => api.post('/target-repos', data),
};

export const changesetsApi = {
  list: (projectId?: string, page?: number, limit?: number) =>
    api.get('/changesets', { params: { projectId, page, limit } }),
  get: (id: string) => api.get(`/changesets/${id}`),
  create: (data: { projectId: string; title: string; body?: string; baseBranch: string }) =>
    api.post('/changesets', {
      ...data,
      body: data.body || undefined,
    }),
  refresh: (id: string) => api.post(`/changesets/${id}/refresh`),
  close: (id: string) => api.post(`/changesets/${id}/close`),
  removeWorktree: (id: string) => api.post(`/changesets/${id}/remove-worktree`),
  delete: (id: string) => api.delete(`/changesets/${id}`),
  // PR-specific functions
  merge: (id: string) => api.post(`/changesets/${id}/merge`),
  reopen: (id: string) => api.post(`/changesets/${id}/reopen`),
};

export const diffsApi = {
  get: (changesetId: string) => api.get(`/changesets/${changesetId}/diff`),
};

export const agentRunsApi = {
  get: (id: string) => api.get(`/agent-runs/${id}`),
  listByChangeset: (changesetId: string) => api.get(`/changesets/${changesetId}/agent-runs`),
  trigger: (
    changesetId: string,
    data: {
      agentKey: string;
      inputSummary?: string;
      prompt: string;
      config: { executablePath: string; baseArgs?: string[] };
    }
  ) =>
    api.post(`/changesets/${changesetId}/agent-runs`, {
      ...data,
      inputSummary: data.inputSummary || undefined,
    }),
  cancel: (id: string) => api.post(`/agent-runs/${id}/cancel`),
};

export const importsApi = {
  list: (changesetId: string) => api.get(`/changesets/${changesetId}/imports`),
  get: (id: string) => api.get(`/imports/${id}`),
  start: (changesetId: string, data: { targetRepoId: string }) =>
    api.post(`/changesets/${changesetId}/imports`, data),
};

export const reviewsApi = {
  getThreads: (changesetId: string) => api.get(`/changesets/${changesetId}/reviews/threads`),
  getThread: (changesetId: string, threadId: string) =>
    api.get(`/changesets/${changesetId}/reviews/threads/${threadId}`),
  createThread: (changesetId: string, data: { file: string; line: number; comment: string }) =>
    api.post(`/changesets/${changesetId}/reviews/threads`, data),
  resolveThread: (changesetId: string, threadId: string) =>
    api.post(`/changesets/${changesetId}/reviews/threads/${threadId}/resolve`),
  unresolveThread: (changesetId: string, threadId: string) =>
    api.post(`/changesets/${changesetId}/reviews/threads/${threadId}/unresolve`),
  addressWithAgent: (
    changesetId: string,
    threadId: string,
    data: {
      agentKey: string;
      prompt: string;
      inputSummary?: string;
    }
  ) => api.post(`/changesets/${changesetId}/reviews/threads/${threadId}/address`, data),
  addComment: (changesetId: string, threadId: string, data: { comment: string }) =>
    api.post(`/changesets/${changesetId}/reviews/threads/${threadId}/comments`, data),
};

export const workItemsApi = {
  // List WorkItems (optional filter by project)
  list: (projectId?: string, page?: number, limit?: number) =>
    api.get('/workitems', { params: { projectId, page, limit } }),
  // Get WorkItem by ID
  get: (id: string) => api.get(`/workitems/${id}`),
  // Create new WorkItem
  create: (
    projectId: string,
    data: {
      type: 'issue' | 'feature-request';
      title: string;
      body?: string;
    }
  ) =>
    api.post(`/projects/${projectId}/workitems`, {
      ...data,
      body: data.body || undefined,
    }),
  // Update WorkItem
  update: (
    id: string,
    data: {
      title?: string;
      body?: string;
      status?: 'open' | 'closed';
    }
  ) => api.patch(`/workitems/${id}`, data),
  // Delete WorkItem
  delete: (id: string) => api.delete(`/workitems/${id}`),
  // Create PR from WorkItem
  createPR: (workItemId: string) => api.post(`/workitems/${workItemId}/create-pr`),
  // Get PRs for WorkItem
  getPRs: (workItemId: string) => api.get(`/workitems/${workItemId}/prs`),
  // Worktree management
  getWorktreeStatus: (projectId: string, worktreePath: string) =>
    api.get(`/projects/${projectId}/worktree-status`, { params: { worktreePath } }),
  recreateWorktree: (projectId: string, worktreePath: string, branchName: string) =>
    api.post(`/projects/${projectId}/worktrees/recreate`, { worktreePath, branchName }),
  removeWorktree: (projectId: string, worktreePath: string) =>
    api.post(`/projects/${projectId}/worktrees/remove`, { worktreePath }),
};
