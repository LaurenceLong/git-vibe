import axios from 'axios';
import type {
  AgentModel,
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
} from 'git-vibe-shared';

const API_BASE_URL = '/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const projectsApi = {
  list: (page?: number, limit?: number) => api.get('/projects', { params: { page, limit } }),
  get: (id: string) => api.get(`/projects/${id}`),
  getByName: (name: string) => api.get(`/projects/name/${name}`),
  getModels: (agent?: string) => api.get<{ data: AgentModel[] }>('/models', { params: { agent } }),
  refreshModels: (agent?: string) =>
    api.post<{ data: AgentModel[] }>('/models/refresh', undefined, { params: { agent } }),
  create: (data: CreateProjectDTO) => api.post('/projects', data),
  update: (id: string, data: UpdateProjectDTO) => api.patch(`/projects/${id}`, data),
  delete: (id: string) => api.delete(`/projects/${id}`),
  sync: (id: string) => api.post(`/projects/${id}/sync`),
  getBranches: (id: string) => api.get(`/projects/${id}/branches`),
  getBranchesByPath: (repoPath: string) => api.get('/branches', { params: { repoPath } }),
  getFiles: (id: string) => api.get(`/projects/${id}/files`),
  getFileContent: (id: string, filePath: string) =>
    api.get(`/projects/${id}/files/content`, { params: { path: filePath } }),
};

export const targetReposApi = {
  list: () => api.get('/target-repos'),
  get: (id: string) => api.get(`/target-repos/${id}`),
  create: (data: CreateTargetRepoDTO) => api.post('/target-repos', data),
};

export const pullRequestsApi = {
  list: (projectId?: string, page?: number, limit?: number) =>
    api.get('/pull-requests', { params: { projectId, page, limit } }),
  get: (id: string) => api.get(`/pull-requests/${id}`),
  getDiff: (id: string) => api.get(`/pull-requests/${id}/diff`),
  getCommits: (id: string) => api.get(`/pull-requests/${id}/commits`),
  merge: (id: string, strategy?: 'merge' | 'squash' | 'rebase') =>
    api.post(`/pull-requests/${id}/merge`, { strategy }),
  close: (id: string) => api.post(`/pull-requests/${id}/close`),
  updateBase: (id: string, rebase?: boolean) =>
    api.post(`/pull-requests/${id}/update-base`, { rebase }),
  getPatch: (id: string) => api.get(`/pull-requests/${id}/patch`),
};

export const agentRunsApi = {
  get: (id: string) => api.get(`/agent-runs/${id}`),
  listByWorkItem: (workItemId: string) => api.get(`/workitems/${workItemId}/tasks`),
  trigger: (workItemId: string, data: TriggerAgentRunDTO) =>
    api.post(`/workitems/${workItemId}/start`, {
      ...data,
      inputSummary: data.inputSummary || undefined,
    }),
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

export const importsApi = {
  list: (pullRequestId: string) => api.get(`/pull-requests/${pullRequestId}/imports`),
  get: (id: string) => api.get(`/imports/${id}`),
  start: (pullRequestId: string, data: CreateImportDTO) =>
    api.post(`/pull-requests/${pullRequestId}/imports`, data),
};

export const reviewsApi = {
  getThreads: (pullRequestId: string) => api.get(`/pull-requests/${pullRequestId}/reviews/threads`),
  getThread: (pullRequestId: string, threadId: string) =>
    api.get(`/pull-requests/${pullRequestId}/reviews/threads/${threadId}`),
  createThread: (pullRequestId: string, data: CreateThreadDTO) =>
    api.post(`/pull-requests/${pullRequestId}/reviews/threads`, data),
  resolveThread: (pullRequestId: string, threadId: string) =>
    api.post(`/pull-requests/${pullRequestId}/reviews/threads/${threadId}/resolve`),
  unresolveThread: (pullRequestId: string, threadId: string) =>
    api.post(`/pull-requests/${pullRequestId}/reviews/threads/${threadId}/unresolve`),
  addressWithAgent: (pullRequestId: string, threadId: string, data: AddressWithAgentDTO) =>
    api.post(`/pull-requests/${pullRequestId}/reviews/threads/${threadId}/address`, data),
  resumeTaskFromThread: (pullRequestId: string, threadId: string, prompt: string) =>
    api.post(`/pull-requests/${pullRequestId}/reviews/threads/${threadId}/resume`, { prompt }),
  addComment: (pullRequestId: string, threadId: string, data: CreateCommentDTO) =>
    api.post(`/pull-requests/${pullRequestId}/reviews/threads/${threadId}/comments`, data),
};

export const workItemsApi = {
  // List WorkItems with optional project filter and pagination
  list: (projectId?: string, page?: number, limit?: number) =>
    api.get('/workitems', { params: { projectId, page, limit } }),
  // Create new WorkItem
  create: (projectId: string, data: CreateWorkItemDTO) =>
    api.post(`/projects/${projectId}/work-items`, {
      ...data,
      body: data.body || undefined,
    }),
  // Initialize workspace for WorkItem
  initWorkspace: (id: string) => api.post(`/work-items/${id}/init-workspace`),
  // Get WorkItem by ID
  get: (id: string) => api.get(`/workitems/${id}`),
  // Update WorkItem
  update: (id: string, data: UpdateWorkItemDTO) => api.patch(`/workitems/${id}`, data),
  // Delete WorkItem
  delete: (id: string) => api.delete(`/workitems/${id}`),
  // Start agent run for WorkItem
  startAgentRun: (id: string, data: TriggerAgentRunDTO) =>
    api.post(`/workitems/${id}/start`, {
      ...data,
      inputSummary: data.inputSummary || undefined,
    }),
  // Resume task for WorkItem
  resume: (id: string, data: { prompt: string }) => api.post(`/work-items/${id}/resume`, data),
  // Refresh WorkItem head SHA
  refresh: (id: string) => api.post(`/workitems/${id}/refresh`),
  // Get PRs for WorkItem
  getPRs: (id: string) => api.get(`/workitems/${id}/prs`),
  // Create PR from WorkItem
  createPR: (id: string) => api.post(`/workitems/${id}/create-pr`),
  // Start task for WorkItem
  startTask: (id: string) => api.post(`/workitems/${id}/start`),
  // Get tasks for WorkItem
  getTasks: (id: string) => api.get(`/workitems/${id}/tasks`),
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
