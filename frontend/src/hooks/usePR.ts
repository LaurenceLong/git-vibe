/**
 * usePR Hook
 *
 * Provides hooks for PR (Pull Request) operations including:
 * - Fetching PR by ID
 * - Merging PRs
 * - Closing PRs
 *
 * @example
 * ```tsx
 * function PRComponent({ prId }: { prId: string }) {
 *   const { pr, isLoading, error } = usePR(prId);
 *   const mergePR = useMergePR(prId);
 *   const closePR = useClosePR(prId);
 *
 *   return (
 *     <div>
 *       <h1>{pr?.title}</h1>
 *       <button onClick={() => mergePR.mutate()}>Merge</button>
 *       <button onClick={() => closePR.mutate()}>Close</button>
 *     </div>
 *   );
 * }
 * ```
 */

import { useQuery, useMutation, useQueryClient, UseQueryResult } from '@tanstack/react-query';
import { pullRequestsApi } from '../lib/api';
import { PullRequest } from '../types';
import { useToast } from '../components/Toast';

/**
 * Hook to fetch a single PR by ID
 *
 * @param id - The ID of PR to fetch
 * @returns Query result with PR data
 */
export function usePR(id: string): UseQueryResult<PullRequest, Error> {
  return useQuery({
    queryKey: ['pull-request', id],
    queryFn: async () => {
      const response = await pullRequestsApi.get(id);
      return response.data as PullRequest;
    },
    enabled: !!id,
  });
}

/**
 * Hook to merge a PR
 *
 * @param id - The ID of PR to merge
 * @returns Mutation object with merge function
 */
export function useMergePR(id: string) {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  const mutation = useMutation({
    mutationFn: async (strategy?: 'merge' | 'squash' | 'rebase') => {
      const response = await pullRequestsApi.merge(id, strategy);
      return response.data as PullRequest;
    },
    onSuccess: () => {
      // Invalidate PR query
      queryClient.invalidateQueries({ queryKey: ['pull-request', id] });
      // Invalidate pull-requests lists
      queryClient.invalidateQueries({ queryKey: ['pull-requests'] });
      success('PR merged successfully');
    },
    onError: (err: Error) => {
      showError(`Failed to merge PR: ${err.message}`);
    },
  });

  return {
    mergePR: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: mutation.error as Error | null,
  };
}

/**
 * Hook to close a PR
 *
 * @param id - The ID of PR to close
 * @returns Mutation object with close function
 */
export function useClosePR(id: string) {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await pullRequestsApi.close(id);
      return response.data as PullRequest;
    },
    onSuccess: () => {
      // Invalidate PR query
      queryClient.invalidateQueries({ queryKey: ['pull-request', id] });
      // Invalidate pull-requests lists
      queryClient.invalidateQueries({ queryKey: ['pull-requests'] });
      success('PR closed successfully');
    },
    onError: (err: Error) => {
      showError(`Failed to close PR: ${err.message}`);
    },
  });

  return {
    closePR: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: mutation.error as Error | null,
  };
}
