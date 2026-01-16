/**
 * useWorkItem Hook
 *
 * Provides hooks for WorkItem operations including:
 * - Fetching WorkItem by ID
 * - Listing WorkItems (optional filter by project)
 * - Creating WorkItems
 * - Updating WorkItems
 * - Deleting WorkItems
 * - Closing WorkItems
 *
 * @example
 * ```tsx
 * function WorkItemComponent({ workItemId }: { workItemId: string }) {
 *   const { workItem, isLoading, error } = useWorkItem(workItemId);
 *   const createWorkItem = useCreateWorkItem();
 *   const closeWorkItem = useCloseWorkItem(workItemId);
 *
 *   return (
 *     <div>
 *       <h1>{workItem?.title}</h1>
 *       <button onClick={() => closeWorkItem.mutate()}>Close</button>
 *     </div>
 *   );
 * }
 * ```
 */

import { useQuery, useMutation, useQueryClient, UseQueryResult } from '@tanstack/react-query';
import { workItemsApi } from '../lib/api';
import { WorkItem, CreateWorkItemInput, UpdateWorkItemInput } from '../types';
import { useToast } from '../components/Toast';

/**
 * Hook to fetch a single WorkItem by ID
 *
 * @param id - The ID of WorkItem to fetch
 * @returns Query result with WorkItem data
 */
export function useWorkItem(id: string): UseQueryResult<WorkItem, Error> {
  return useQuery({
    queryKey: ['workitem', id],
    queryFn: async () => {
      const response = await workItemsApi.get(id);
      return response.data as WorkItem;
    },
    enabled: !!id,
  });
}

/**
 * Hook to fetch WorkItems, optionally filtered by project
 *
 * @param projectId - Optional project ID to filter WorkItems
 * @returns Query result with WorkItem array
 */
export function useWorkItems(projectId?: string): UseQueryResult<WorkItem[], Error> {
  return useQuery({
    queryKey: ['workitems', projectId],
    queryFn: async () => {
      const response = await workItemsApi.list(projectId);
      // Backend returns { data: WorkItem[], pagination: {...} }
      return response.data.data as WorkItem[];
    },
  });
}

/**
 * Hook to create a new WorkItem
 *
 * @returns Mutation object with create function
 */
export function useCreateWorkItem() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  const mutation = useMutation({
    mutationFn: async (data: { projectId: string } & CreateWorkItemInput) => {
      const { projectId, ...workItemData } = data;
      const response = await workItemsApi.create(projectId, {
        projectId,
        ...workItemData,
      });
      return response.data as WorkItem;
    },
    onSuccess: (_, variables) => {
      // Invalidate WorkItems list for project
      queryClient.invalidateQueries({ queryKey: ['workitems', variables.projectId] });
      // Invalidate all WorkItems list
      queryClient.invalidateQueries({ queryKey: ['workitems'] });
      success('WorkItem created successfully');
    },
    onError: (err: Error) => {
      showError(`Failed to create WorkItem: ${err.message}`);
    },
  });

  return {
    createWorkItem: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: mutation.error as Error | null,
  };
}

/**
 * Hook to update a WorkItem
 *
 * @param id - The ID of WorkItem to update
 * @returns Mutation object with update function
 */
export function useUpdateWorkItem(id: string) {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  const mutation = useMutation({
    mutationFn: async (data: UpdateWorkItemInput) => {
      const response = await workItemsApi.update(id, data);
      return response.data as WorkItem;
    },
    onSuccess: () => {
      // Invalidate specific WorkItem query
      queryClient.invalidateQueries({ queryKey: ['workitem', id] });
      // Invalidate WorkItems lists
      queryClient.invalidateQueries({ queryKey: ['workitems'] });
      success('WorkItem updated successfully');
    },
    onError: (err: Error) => {
      showError(`Failed to update WorkItem: ${err.message}`);
    },
  });

  return {
    updateWorkItem: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: mutation.error as Error | null,
  };
}

/**
 * Hook to delete a WorkItem
 *
 * @param id - The ID of WorkItem to delete
 * @returns Mutation object with delete function
 */
export function useDeleteWorkItem(id: string) {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await workItemsApi.delete(id);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate specific WorkItem query
      queryClient.invalidateQueries({ queryKey: ['workitem', id] });
      // Invalidate WorkItems lists
      queryClient.invalidateQueries({ queryKey: ['workitems'] });
      success('WorkItem deleted successfully');
    },
    onError: (err: Error) => {
      showError(`Failed to delete WorkItem: ${err.message}`);
    },
  });

  return {
    deleteWorkItem: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: mutation.error as Error | null,
  };
}

/**
 * Hook to close a WorkItem
 *
 * @param id - The ID of WorkItem to close
 * @returns Mutation object with close function
 */
export function useCloseWorkItem(id: string) {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await workItemsApi.update(id, { status: 'closed' });
      return response.data as WorkItem;
    },
    onSuccess: () => {
      // Invalidate specific WorkItem query
      queryClient.invalidateQueries({ queryKey: ['workitem', id] });
      // Invalidate WorkItems lists
      queryClient.invalidateQueries({ queryKey: ['workitems'] });
      success('WorkItem closed successfully');
    },
    onError: (err: Error) => {
      showError(`Failed to close WorkItem: ${err.message}`);
    },
  });

  return {
    closeWorkItem: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: mutation.error as Error | null,
  };
}

/**
 * Hook to create a PR from a WorkItem
 *
 * @param workItemId - The ID of WorkItem
 * @returns Mutation object with create PR function
 */
export function useCreatePRFromWorkItem(workItemId: string) {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await workItemsApi.createPR(workItemId);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate WorkItem query to update PR linkage
      queryClient.invalidateQueries({ queryKey: ['workitem', workItemId] });
      // Invalidate WorkItems lists
      queryClient.invalidateQueries({ queryKey: ['workitems'] });
      // Invalidate pull-requests lists
      queryClient.invalidateQueries({ queryKey: ['pull-requests'] });
      success('PR created successfully from WorkItem');
    },
    onError: (err: Error) => {
      showError(`Failed to create PR from WorkItem: ${err.message}`);
    },
  });

  return {
    createPR: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: mutation.error as Error | null,
  };
}

/**
 * Hook to start a task for a WorkItem
 *
 * @param workItemId - The ID of WorkItem
 * @returns Mutation object with start task function
 */
export function useStartWorkItemTask(workItemId: string) {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await workItemsApi.startTask(workItemId);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate WorkItem query to update task status
      queryClient.invalidateQueries({ queryKey: ['workitem', workItemId] });
      // Invalidate WorkItems lists
      queryClient.invalidateQueries({ queryKey: ['workitems'] });
      // Invalidate pull-requests lists
      queryClient.invalidateQueries({ queryKey: ['pull-requests'] });
      success('Task started successfully');
    },
    onError: (err: Error) => {
      showError(`Failed to start task: ${err.message}`);
    },
  });

  return {
    startTask: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: mutation.error as Error | null,
  };
}

/**
 * Hook to cancel a task for a WorkItem
 *
 * @param workItemId - The ID of WorkItem
 * @param taskId - The ID of the task to cancel
 * @returns Mutation object with cancel task function
 */
export function useCancelWorkItemTask(workItemId: string, taskId: string) {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await workItemsApi.cancelTask(workItemId, taskId);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate WorkItem query to update task status
      queryClient.invalidateQueries({ queryKey: ['workitem', workItemId] });
      // Invalidate WorkItems lists
      queryClient.invalidateQueries({ queryKey: ['workitems'] });
      success('Task cancelled successfully');
    },
    onError: (err: Error) => {
      showError(`Failed to cancel task: ${err.message}`);
    },
  });

  return {
    cancelTask: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: mutation.error as Error | null,
  };
}

/**
 * Hook to restart a task for a WorkItem
 *
 * @param workItemId - The ID of WorkItem
 * @param taskId - The ID of the task to restart
 * @returns Mutation object with restart task function
 */
export function useRestartWorkItemTask(workItemId: string, taskId: string) {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await workItemsApi.restartTask(workItemId, taskId);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate WorkItem query to update task status
      queryClient.invalidateQueries({ queryKey: ['workitem', workItemId] });
      // Invalidate WorkItems lists
      queryClient.invalidateQueries({ queryKey: ['workitems'] });
      // Invalidate pull-requests lists
      queryClient.invalidateQueries({ queryKey: ['pull-requests'] });
      success('Task restarted successfully');
    },
    onError: (err: Error) => {
      showError(`Failed to restart task: ${err.message}`);
    },
  });

  return {
    restartTask: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: mutation.error as Error | null,
  };
}

/**
 * Hook to resume a task for a WorkItem
 *
 * @param workItemId - The ID of WorkItem
 * @param taskId - The ID of the task to resume
 * @param prompt - The prompt to resume with
 * @returns Mutation object with resume task function
 */
export function useResumeWorkItemTask(workItemId: string, taskId: string, prompt: string) {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await workItemsApi.resumeTask(workItemId, taskId, prompt);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate WorkItem query to update task status
      queryClient.invalidateQueries({ queryKey: ['workitem', workItemId] });
      // Invalidate WorkItems lists
      queryClient.invalidateQueries({ queryKey: ['workitems'] });
      // Invalidate pull-requests lists
      queryClient.invalidateQueries({ queryKey: ['pull-requests'] });
      success('Task resumed successfully');
    },
    onError: (err: Error) => {
      showError(`Failed to resume task: ${err.message}`);
    },
  });

  return {
    resumeTask: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: mutation.error as Error | null,
  };
}
