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
import type { WorkItemDTO } from 'git-vibe-shared';
import { CreateWorkItemInput, UpdateWorkItemInput } from '../types';
import { useToast } from '../components/Toast';
import { extractErrorMessage } from '../lib/errorUtils';

/**
 * Hook to fetch a single WorkItem by ID
 *
 * @param id - The ID of WorkItem to fetch
 * @returns Query result with WorkItem data
 */
export function useWorkItem(id: string): UseQueryResult<WorkItemDTO, Error> {
  return useQuery({
    queryKey: ['workitem', id],
    queryFn: async () => {
      const response = await workItemsApi.get(id);
      return response.data;
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
export function useWorkItems(projectId?: string): UseQueryResult<WorkItemDTO[], Error> {
  return useQuery({
    queryKey: ['workitems', projectId],
    queryFn: async () => {
      const response = await workItemsApi.list(projectId);
      // Backend returns { data: WorkItem[], total, page, pageSize }
      return response.data.data;
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
      return response.data;
    },
    onSuccess: (_, variables) => {
      // Invalidate WorkItems list for project
      queryClient.invalidateQueries({ queryKey: ['workitems', variables.projectId] });
      // Invalidate all WorkItems list
      queryClient.invalidateQueries({ queryKey: ['workitems'] });
      success('WorkItem created successfully');
    },
    onError: (err: unknown) => {
      const errorMessage = extractErrorMessage(err, 'Failed to create WorkItem');
      showError(errorMessage);
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
      return response.data;
    },
    onSuccess: () => {
      // Invalidate specific WorkItem query
      queryClient.invalidateQueries({ queryKey: ['workitem', id] });
      // Invalidate WorkItems lists
      queryClient.invalidateQueries({ queryKey: ['workitems'] });
      success('WorkItem updated successfully');
    },
    onError: (err: unknown) => {
      const errorMessage = extractErrorMessage(err, 'Failed to update WorkItem');
      showError(errorMessage);
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
 * @param onSuccess - Optional callback to execute after successful deletion
 * @returns Mutation object with delete function
 */
export function useDeleteWorkItem(id: string, onSuccess?: () => void) {
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
      // Execute optional callback after showing success message
      if (onSuccess) {
        onSuccess();
      }
    },
    onError: (err: unknown) => {
      const errorMessage = extractErrorMessage(err, 'Failed to delete WorkItem');
      showError(errorMessage);
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
      return response.data;
    },
    onSuccess: () => {
      // Invalidate specific WorkItem query
      queryClient.invalidateQueries({ queryKey: ['workitem', id] });
      // Invalidate WorkItems lists
      queryClient.invalidateQueries({ queryKey: ['workitems'] });
      success('WorkItem closed successfully');
    },
    onError: (err: unknown) => {
      const errorMessage = extractErrorMessage(err, 'Failed to close WorkItem');
      showError(errorMessage);
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
    onError: (err: unknown) => {
      const errorMessage = extractErrorMessage(err, 'Failed to create PR from WorkItem');
      showError(errorMessage);
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
    onError: (err: unknown) => {
      const errorMessage = extractErrorMessage(err, 'Failed to start task');
      showError(errorMessage);
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
    onError: (err: unknown) => {
      const errorMessage = extractErrorMessage(err, 'Failed to cancel task');
      showError(errorMessage);
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
    onError: (err: unknown) => {
      const errorMessage = extractErrorMessage(err, 'Failed to restart task');
      showError(errorMessage);
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
    onError: (err: unknown) => {
      const errorMessage = extractErrorMessage(err, 'Failed to resume task');
      showError(errorMessage);
    },
  });

  return {
    resumeTask: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: mutation.error as Error | null,
  };
}
