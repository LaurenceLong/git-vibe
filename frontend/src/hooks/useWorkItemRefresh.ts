/**
 * useWorkItemRefresh Hook
 *
 * Refreshes WorkItem head_sha.
 * Shows toast notification on success/error.
 * Invalidates WorkItem query after successful refresh.
 *
 * @example
 * ```tsx
 * function WorkItemComponent({ workItemId }: { workItemId: string }) {
 *   const { refreshHead, isLoading, error } = useWorkItemRefresh(workItemId);
 *
 *   return (
 *     <button onClick={refreshHead} disabled={isLoading}>
 *       Refresh Head
 *     </button>
 *   );
 * }
 * ```
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { workItemsApi } from '../lib/api';
import { useToast } from '../components/Toast';

interface UseWorkItemRefreshResult {
  /** Function to refresh the WorkItem head */
  refreshHead: () => Promise<void>;
  /** Whether the refresh operation is in progress */
  isLoading: boolean;
  /** Any error that occurred during refresh */
  error: Error | null;
}

/**
 * Hook to refresh WorkItem head_sha
 *
 * @param workItemId - The ID of the WorkItem to refresh
 * @returns Object containing refresh function, loading state, and error
 */
export function useWorkItemRefresh(workItemId: string): UseWorkItemRefreshResult {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await workItemsApi.refresh(workItemId);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate WorkItem query to fetch updated data
      queryClient.invalidateQueries({ queryKey: ['workitem', workItemId] });
      success('WorkItem head refreshed successfully');
    },
    onError: (err: Error) => {
      showError(`Failed to refresh WorkItem head: ${err.message}`);
    },
  });

  return {
    refreshHead: () => mutation.mutateAsync(),
    isLoading: mutation.isPending,
    error: mutation.error as Error | null,
  };
}
