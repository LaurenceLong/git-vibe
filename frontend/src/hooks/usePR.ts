/**
 * usePR Hook
 *
 * Provides hooks for PR (Pull Request/ChangeSet) operations including:
 * - Fetching PR by ID
 * - Merging PRs
 * - Closing PRs
 * - Reopening PRs
 *
 * @example
 * ```tsx
 * function PRComponent({ prId }: { prId: string }) {
 *   const { pr, isLoading, error } = usePR(prId);
 *   const mergePR = useMergePR(prId);
 *   const closePR = useClosePR(prId);
 *   const reopenPR = useReopenPR(prId);
 *
 *   return (
 *     <div>
 *       <h1>{pr?.title}</h1>
 *       <button onClick={() => mergePR.mutate()}>Merge</button>
 *       <button onClick={() => closePR.mutate()}>Close</button>
 *       <button onClick={() => reopenPR.mutate()}>Reopen</button>
 *     </div>
 *   );
 * }
 * ```
 */

import { useQuery, useMutation, useQueryClient, UseQueryResult } from '@tanstack/react-query';
import { changesetsApi } from '../lib/api';
import { ChangeSet } from '../types';
import { useToast } from '../components/Toast';

/**
 * Hook to fetch a single PR (ChangeSet) by ID
 *
 * @param id - The ID of PR to fetch
 * @returns Query result with PR data
 */
export function usePR(id: string): UseQueryResult<ChangeSet, Error> {
  return useQuery({
    queryKey: ['changeset', id],
    queryFn: async () => {
      const response = await changesetsApi.get(id);
      return response.data as ChangeSet;
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
    mutationFn: async () => {
      const response = await changesetsApi.merge(id);
      return response.data as ChangeSet;
    },
    onSuccess: () => {
      // Invalidate PR query
      queryClient.invalidateQueries({ queryKey: ['changeset', id] });
      // Invalidate changesets lists
      queryClient.invalidateQueries({ queryKey: ['changesets'] });
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
      const response = await changesetsApi.close(id);
      return response.data as ChangeSet;
    },
    onSuccess: () => {
      // Invalidate PR query
      queryClient.invalidateQueries({ queryKey: ['changeset', id] });
      // Invalidate changesets lists
      queryClient.invalidateQueries({ queryKey: ['changesets'] });
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

/**
 * Hook to reopen a closed PR
 *
 * @param id - The ID of PR to reopen
 * @returns Mutation object with reopen function
 */
export function useReopenPR(id: string) {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await changesetsApi.reopen(id);
      return response.data as ChangeSet;
    },
    onSuccess: () => {
      // Invalidate PR query
      queryClient.invalidateQueries({ queryKey: ['changeset', id] });
      // Invalidate changesets lists
      queryClient.invalidateQueries({ queryKey: ['changesets'] });
      success('PR reopened successfully');
    },
    onError: (err: Error) => {
      showError(`Failed to reopen PR: ${err.message}`);
    },
  });

  return {
    reopenPR: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: mutation.error as Error | null,
  };
}
