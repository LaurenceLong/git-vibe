/**
 * Standardized TanStack Query keys for server-state sync.
 * Use these so invalidateQueries/refetch stay consistent across the app.
 */

export const queryKeys = {
  /** Work item list: ['workitems', filters] */
  workitems: (filters: { projectId?: string; page?: number; limit?: number } = {}) =>
    ['workitems', filters] as const,

  /** Work item detail: ['workitem', id] */
  workitem: (id: string) => ['workitem', id] as const,

  /** Task list per work item: ['tasks', workItemId] */
  tasks: (workItemId: string) => ['tasks', workItemId] as const,
} as const;
