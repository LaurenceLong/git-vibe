/**
 * useChangeSetRefresh Hook
 *
 * Refreshes changeset head_sha.
 * Shows toast notification on success/error.
 * Invalidates changeset query after successful refresh.
 *
 * @example
 * ```tsx
 * function ChangeSetComponent({ changesetId }: { changesetId: string }) {
 *   const { refreshHead, isLoading, error } = useChangeSetRefresh(changesetId);
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
import { changesetsApi } from '../lib/api';
import { useToast } from '../components/Toast';

interface UseChangeSetRefreshResult {
  /** Function to refresh the changeset head */
  refreshHead: () => Promise<void>;
  /** Whether the refresh operation is in progress */
  isLoading: boolean;
  /** Any error that occurred during refresh */
  error: Error | null;
}

/**
 * Hook to refresh changeset head_sha
 *
 * @param changesetId - The ID of the changeset to refresh
 * @returns Object containing refresh function, loading state, and error
 */
export function useChangeSetRefresh(changesetId: string): UseChangeSetRefreshResult {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await changesetsApi.refresh(changesetId);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate changeset query to fetch updated data
      queryClient.invalidateQueries({ queryKey: ['changeset', changesetId] });
      success('Changeset head refreshed successfully');
    },
    onError: (err: Error) => {
      showError(`Failed to refresh changeset head: ${err.message}`);
    },
  });

  return {
    refreshHead: () => mutation.mutateAsync(),
    isLoading: mutation.isPending,
    error: mutation.error as Error | null,
  };
}
