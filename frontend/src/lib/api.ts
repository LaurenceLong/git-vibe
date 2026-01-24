import axios from 'axios';
import { z } from 'zod';
import type {
  CreateProjectDTO,
  UpdateProjectDTO,
  TriggerAgentRunDTO,
  CreateThreadDTO,
  AddressWithAgentDTO,
  CreateCommentDTO,
  CreateWorkItemDTO,
  UpdateWorkItemDTO,
} from 'git-vibe-shared';
import {
  PullRequestSchema,
  AgentRunSchema,
  WorkItemSchema,
  ProjectSchema,
  ReviewThreadSchema,
  ReviewCommentSchema,
  CommitSchema,
  CommitWithTaskSchema,
  createPaginatedResponseSchema,
  ModelsResponseSchema,
  ProjectsListResponseSchema,
  SearchResponseSchema,
  BranchesResponseSchema,
} from 'git-vibe-shared';

const API_BASE_URL = '/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Helper function to get the api client (for compatibility)
export const getApiClient = () => api;

export const projectsApi = {
  list: async (page?: number, limit?: number, includeStats?: boolean) => {
    const response = await api.get('/projects', { params: { page, limit, includeStats } });
    return { ...response, data: ProjectsListResponseSchema.parse(response.data) };
  },
  get: async (id: string) => {
    const response = await api.get(`/projects/${id}`);
    return { ...response, data: ProjectSchema.parse(response.data) };
  },
  getByName: async (name: string) => {
    const response = await api.get(`/projects/name/${name}`);
    return { ...response, data: ProjectSchema.parse(response.data) };
  },
  getModels: async (agent?: string) => {
    const response = await api.get('/models', { params: { agent } });
    return { ...response, data: ModelsResponseSchema.parse(response.data) };
  },
  refreshModels: async (agent?: string) => {
    const response = await api.post('/models/refresh', undefined, { params: { agent } });
    return { ...response, data: ModelsResponseSchema.parse(response.data) };
  },
  create: async (data: CreateProjectDTO) => {
    const response = await api.post('/projects', data);
    return { ...response, data: ProjectSchema.parse(response.data) };
  },
  update: async (id: string, data: UpdateProjectDTO) => {
    const response = await api.patch(`/projects/${id}`, data);
    return { ...response, data: ProjectSchema.parse(response.data) };
  },
  delete: (id: string) => api.delete(`/projects/${id}`),
  sync: (id: string) => api.post(`/projects/${id}/sync`),
  getBranches: (id: string) => api.get(`/projects/${id}/branches`),
  getBranchesByPath: async (repoPath: string) => {
    const response = await api.get('/branches', { params: { repoPath } });
    return { ...response, data: BranchesResponseSchema.parse(response.data) };
  },
  getFiles: (id: string) => api.get(`/projects/${id}/files`),
  getFileContent: (id: string, filePath: string) =>
    api.get(`/projects/${id}/files/content`, { params: { path: filePath } }),
  // Manual file operations with WorkItem
  getOrCreateManualWorkItem: (id: string, title?: string) =>
    api.post(`/projects/${id}/work-items/manual`, { title }),
  getWorkItemFiles: (id: string, workItemId: string) =>
    api.get(`/projects/${id}/work-items/${workItemId}/files`),
  getWorkItemFileContent: (id: string, workItemId: string, filePath: string) =>
    api.get(`/projects/${id}/work-items/${workItemId}/files/content`, {
      params: { path: filePath },
    }),
  createFile: (id: string, workItemId: string, path: string, content: string) =>
    api.post(`/projects/${id}/work-items/${workItemId}/files`, { path, content }),
  updateFile: (id: string, workItemId: string, path: string, content: string) =>
    api.put(`/projects/${id}/work-items/${workItemId}/files`, { path, content }),
  deleteFile: (id: string, workItemId: string, path: string) =>
    api.delete(`/projects/${id}/work-items/${workItemId}/files`, { params: { path } }),
  commitChanges: (id: string, workItemId: string, message: string) =>
    api.post(`/projects/${id}/work-items/${workItemId}/commit`, { message }),
  createPRFromWorkItem: (id: string, workItemId: string) =>
    api.post(`/projects/${id}/work-items/${workItemId}/create-pr`),
};

export const pullRequestsApi = {
  list: async (projectId?: string, page?: number, limit?: number) => {
    const response = await api.get('/pull-requests', { params: { projectId, page, limit } });
    return {
      ...response,
      data: createPaginatedResponseSchema(PullRequestSchema).parse(response.data),
    };
  },
  get: async (id: string) => {
    const response = await api.get(`/pull-requests/${id}`);
    return { ...response, data: PullRequestSchema.parse(response.data) };
  },
  getDiff: (id: string) => api.get(`/pull-requests/${id}/diff`),
  getCommits: async (id: string) => {
    const response = await api.get(`/pull-requests/${id}/commits`);
    return { ...response, data: z.array(CommitSchema).parse(response.data) };
  },
  getCommitsWithTasks: async (id: string) => {
    const response = await api.get(`/pull-requests/${id}/commits-with-tasks`);
    return { ...response, data: z.array(CommitWithTaskSchema).parse(response.data) };
  },
  getStatistics: (id: string) => api.get(`/pull-requests/${id}/statistics`),
  merge: async (id: string, strategy?: 'merge' | 'squash' | 'rebase') => {
    const response = await api.post(`/pull-requests/${id}/merge`, { strategy });
    return { ...response, data: PullRequestSchema.parse(response.data) };
  },
  close: async (id: string) => {
    const response = await api.post(`/pull-requests/${id}/close`);
    return { ...response, data: PullRequestSchema.parse(response.data) };
  },
  updateBase: (id: string, rebase?: boolean) =>
    api.post(`/pull-requests/${id}/update-base`, { rebase }),
  getPatch: (id: string) => api.get(`/pull-requests/${id}/patch`),
};

export const agentRunsApi = {
  get: async (id: string) => {
    const response = await api.get(`/agent-runs/${id}`);
    return { ...response, data: AgentRunSchema.parse(response.data) };
  },
  listByWorkItem: async (workItemId: string) => {
    const response = await api.get(`/workitems/${workItemId}/tasks`);
    return { ...response, data: z.array(AgentRunSchema).parse(response.data) };
  },
  trigger: async (workItemId: string, data: TriggerAgentRunDTO) => {
    const response = await api.post(`/workitems/${workItemId}/start`, {
      ...data,
      inputSummary: data.inputSummary || undefined,
    });
    return { ...response, data: AgentRunSchema.parse(response.data) };
  },
  cancel: (id: string) => api.post(`/agent-runs/${id}/cancel`),
  // Get stdout log for an agent run
  getStdout: async (id: string): Promise<string> => {
    const response = await api.get<string>(`/agent-runs/${id}/stdout`);
    return response.data;
  },
  // Get stderr log for an agent run
  getStderr: async (id: string): Promise<string> => {
    const response = await api.get<string>(`/agent-runs/${id}/stderr`);
    return response.data;
  },
  // Get both stdout and stderr logs for an agent run
  getLogs: async (id: string): Promise<{ stdout: string; stderr: string }> => {
    const response = await api.get<{ stdout: string; stderr: string }>(`/agent-runs/${id}/logs`);
    return response.data;
  },
  // Get the last N lines of stdout log (for preview in list)
  getStdoutTail: async (id: string, lines: number = 10): Promise<string> => {
    const fullLog = await agentRunsApi.getStdout(id);
    const logLines = fullLog.split('\n');
    const tailLines = logLines.slice(-lines);
    return tailLines.join('\n');
  },
  // Get the last N lines of stderr log (for preview in list)
  getStderrTail: async (id: string, lines: number = 10): Promise<string> => {
    const fullLog = await agentRunsApi.getStderr(id);
    const logLines = fullLog.split('\n');
    const tailLines = logLines.slice(-lines);
    return tailLines.join('\n');
  },
};

export const reviewsApi = {
  getThreads: async (pullRequestId: string) => {
    const response = await api.get(`/pull-requests/${pullRequestId}/reviews/threads`);
    return { ...response, data: z.array(ReviewThreadSchema).parse(response.data) };
  },
  getThread: async (pullRequestId: string, threadId: string) => {
    const response = await api.get(`/pull-requests/${pullRequestId}/reviews/threads/${threadId}`);
    return { ...response, data: ReviewThreadSchema.parse(response.data) };
  },
  createThread: async (pullRequestId: string, data: CreateThreadDTO) => {
    const response = await api.post(`/pull-requests/${pullRequestId}/reviews/threads`, data);
    return { ...response, data: ReviewThreadSchema.parse(response.data) };
  },
  resolveThread: async (pullRequestId: string, threadId: string) => {
    const response = await api.post(
      `/pull-requests/${pullRequestId}/reviews/threads/${threadId}/resolve`
    );
    return { ...response, data: ReviewThreadSchema.parse(response.data) };
  },
  unresolveThread: async (pullRequestId: string, threadId: string) => {
    const response = await api.post(
      `/pull-requests/${pullRequestId}/reviews/threads/${threadId}/unresolve`
    );
    return { ...response, data: ReviewThreadSchema.parse(response.data) };
  },
  addressWithAgent: async (pullRequestId: string, threadId: string, data: AddressWithAgentDTO) => {
    const response = await api.post(
      `/pull-requests/${pullRequestId}/reviews/threads/${threadId}/address`,
      data
    );
    return { ...response, data: AgentRunSchema.parse(response.data) };
  },
  resumeTaskFromThread: async (pullRequestId: string, threadId: string, prompt: string) => {
    const response = await api.post(
      `/pull-requests/${pullRequestId}/reviews/threads/${threadId}/resume`,
      { prompt }
    );
    return { ...response, data: AgentRunSchema.parse(response.data) };
  },
  addComment: async (pullRequestId: string, threadId: string, data: CreateCommentDTO) => {
    const response = await api.post(
      `/pull-requests/${pullRequestId}/reviews/threads/${threadId}/comments`,
      data
    );
    return { ...response, data: ReviewCommentSchema.parse(response.data) };
  },
};

export const workItemsApi = {
  // List WorkItems with optional project filter and pagination
  list: async (projectId?: string, page?: number, limit?: number) => {
    const response = await api.get('/workitems', { params: { projectId, page, limit } });
    return {
      ...response,
      data: createPaginatedResponseSchema(WorkItemSchema).parse(response.data),
    };
  },
  // Create new WorkItem
  create: async (projectId: string, data: CreateWorkItemDTO) => {
    const response = await api.post(`/projects/${projectId}/work-items`, {
      ...data,
      body: data.body || undefined,
    });
    return { ...response, data: WorkItemSchema.parse(response.data) };
  },
  // Initialize workspace for WorkItem
  initWorkspace: (id: string) => api.post(`/work-items/${id}/init-workspace`),
  // Get WorkItem by ID
  get: async (id: string) => {
    const response = await api.get(`/workitems/${id}`);
    return { ...response, data: WorkItemSchema.parse(response.data) };
  },
  // Update WorkItem
  update: async (id: string, data: UpdateWorkItemDTO) => {
    const response = await api.patch(`/workitems/${id}`, data);
    return { ...response, data: WorkItemSchema.parse(response.data) };
  },
  // Delete WorkItem
  delete: (id: string) => api.delete(`/workitems/${id}`),
  // Start agent run for WorkItem
  startAgentRun: async (id: string, data: TriggerAgentRunDTO) => {
    const response = await api.post(`/workitems/${id}/start`, {
      ...data,
      inputSummary: data.inputSummary || undefined,
    });
    return { ...response, data: AgentRunSchema.parse(response.data) };
  },
  // Resume task for WorkItem
  resume: (id: string, data: { prompt: string }) => api.post(`/work-items/${id}/resume`, data),
  // Refresh WorkItem head SHA
  refresh: (id: string) => api.post(`/workitems/${id}/refresh`),
  // Get PRs for WorkItem
  getPRs: async (id: string) => {
    const response = await api.get(`/workitems/${id}/prs`);
    return { ...response, data: z.array(PullRequestSchema).parse(response.data) };
  },
  // Create PR from WorkItem
  createPR: async (id: string) => {
    const response = await api.post(`/workitems/${id}/create-pr`);
    return { ...response, data: PullRequestSchema.parse(response.data) };
  },
  // Start task for WorkItem
  startTask: (id: string, message?: string) =>
    api.post(`/workitems/${id}/start`, message ? { message } : undefined),
  // Get tasks for WorkItem
  getTasks: async (id: string) => {
    const response = await api.get(`/workitems/${id}/tasks`);
    return { ...response, data: z.array(AgentRunSchema).parse(response.data) };
  },
  // Cancel task
  cancelTask: (id: string, taskId: string) => api.post(`/workitems/${id}/tasks/${taskId}/cancel`),
  // Restart task
  restartTask: (id: string, taskId: string) => api.post(`/workitems/${id}/tasks/${taskId}/restart`),
  // Get task status
  getTaskStatus: (id: string, taskId: string) => api.get(`/workitems/${id}/tasks/${taskId}/status`),
  // Resume task with session
  resumeTask: (id: string, taskId: string, prompt: string) =>
    api.post(`/workitems/${id}/tasks/${taskId}/resume`, { prompt }),
};

export const diffsApi = {
  get: async (pullRequestId: string) => {
    const response = await api.get(`/pull-requests/${pullRequestId}/diff`);
    // API returns { diff, baseSha, headSha }, extract the diff string
    const diffData = response.data;
    if (typeof diffData === 'string') {
      return { ...response, data: diffData };
    }
    if (diffData && typeof diffData === 'object' && 'diff' in diffData) {
      return { ...response, data: typeof diffData.diff === 'string' ? diffData.diff : '' };
    }
    return { ...response, data: '' };
  },
};

export const workflowsApi = {
  list: async (projectId: string, page?: number, limit?: number) => {
    const response = await api.get('/workflows', { params: { projectId, page, limit } });
    return response;
  },
  get: async (id: string) => {
    const response = await api.get(`/workflows/${id}`);
    return response;
  },
  create: async (
    projectId: string,
    data: { name: string; description?: string; definition: any; isDefault?: boolean }
  ) => {
    const response = await api.post('/workflows', data, { params: { projectId } });
    return response;
  },
  update: async (
    id: string,
    data: { name?: string; description?: string; definition?: any; isDefault?: boolean }
  ) => {
    const response = await api.patch(`/workflows/${id}`, data);
    return response;
  },
  getRuns: async (workflowId: string, workItemId?: string) => {
    const response = await api.get(`/workflows/${workflowId}/runs`, {
      params: { workItemId },
    });
    return response;
  },
  getRunSteps: async (runId: string) => {
    const response = await api.get(`/workflow-runs/${runId}/steps`);
    return response;
  },
};

export const searchApi = {
  search: async (query: string, limit: number = 20) => {
    const response = await api.get('/search', { params: { q: query, limit } });
    const raw = response.data ?? {};
    return {
      ...response,
      data: SearchResponseSchema.parse({
        projects: raw.projects ?? [],
        workItems: raw.workItems ?? [],
        pullRequests: raw.pullRequests ?? [],
        projectNames: raw.projectNames ?? {},
      }),
    };
  },
};
