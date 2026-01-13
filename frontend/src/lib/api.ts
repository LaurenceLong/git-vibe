import axios from 'axios';

const API_BASE_URL = '/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const projectsApi = {
  list: () => api.get('/projects'),
  get: (id: string) => api.get(`/projects/${id}`),
  create: (data: { name: string; sourceRepoPath: string; sourceRepoUrl?: string }) =>
    api.post('/projects', data),
};

export const targetReposApi = {
  list: () => api.get('/target-repos'),
  get: (id: string) => api.get(`/target-repos/${id}`),
  create: (data: { name: string; repoPath: string }) => api.post('/target-repos', data),
};

export const changesetsApi = {
  list: (projectId?: string) => api.get('/changesets', { params: { projectId } }),
  get: (id: string) => api.get(`/changesets/${id}`),
  create: (data: {
    projectId: string;
    title: string;
    body?: string;
    baseBranch: string;
  }) => api.post('/changesets', {
    ...data,
    body: data.body || undefined,
  }),
  refresh: (id: string) => api.post(`/changesets/${id}/refresh`),
  delete: (id: string) => api.delete(`/changesets/${id}`),
};

export const diffsApi = {
  get: (changesetId: string) => api.get(`/diffs/changesets/${changesetId}`),
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
    },
  ) => api.post(`/changesets/${changesetId}/agent-runs`, {
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