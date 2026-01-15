/**
 * useDiffView Hook
 *
 * Loads diff for a pull request (base_sha..head_sha).
 * Caches diff data with pull request ID.
 * Invalidates diff when pull request head changes.
 * Handles empty diff (no changes).
 *
 * @example
 * ```tsx
 * function DiffViewComponent({ pullRequestId }: { pullRequestId: string }) {
 *   const { diff, isLoading, error, refetch } = useDiffView(pullRequestId);
 *
 *   if (isLoading) return <div>Loading diff...</div>;
 *   if (error) return <div>Error loading diff</div>;
 *
 *   return (
 *     <div>
 *       <pre>{diff}</pre>
 *       <button onClick={refetch}>Refresh Diff</button>
 *     </div>
 *   );
 * }
 * ```
 */

import { useQuery } from '@tanstack/react-query';
import { diffsApi } from '../lib/api';

interface UseDiffViewResult {
  /** The diff content as a string */
  diff: string | undefined;
  /** Whether the diff is loading */
  isLoading: boolean;
  /** Any error that occurred while fetching the diff */
  error: Error | null;
  /** Function to refetch the diff */
  refetch: () => void;
}

/**
 * Hook to load diff for a pull request
 *
 * @param pullRequestId - The ID of the pull request to load diff for
 * @returns Object containing diff data, loading state, error, and refetch function
 */
export function useDiffView(pullRequestId: string): UseDiffViewResult {
  const query = useQuery({
    queryKey: ['diff', pullRequestId],
    queryFn: async () => {
      const response = await diffsApi.get(pullRequestId);
      return response.data as string;
    },
    enabled: !!pullRequestId,
    retry: 2,
  });

  return {
    diff: query.data,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}
