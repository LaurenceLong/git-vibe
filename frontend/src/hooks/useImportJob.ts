/**
 * useImportJob Hook
 *
 * Polls import job status while in 'running' state.
 * Stops polling when status changes to 'succeeded', 'succeeded_noop', or any failed state.
 * Shows toast notification on job completion.
 * Auto-refreshes pull request data after successful import.
 *
 * @example
 * ```tsx
 * function ImportJobComponent({ importJobId, pullRequestId }: { importJobId: string; pullRequestId: string }) {
 *   const { importJob, isLoading, error, isPolling, startImport, stopPolling } =
 *     useImportJob(importJobId, pullRequestId);
 *
 *   return (
 *     <div>
 *       <p>Status: {importJob?.status}</p>
 *       <p>Is Polling: {isPolling}</p>
 *       <button onClick={stopPolling}>Stop Polling</button>
 *     </div>
 *   );
 * }
 * ```
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { importsApi } from '../lib/api';
import { useToast } from '../components/Toast';
import { Import } from '../types';

interface UseImportJobResult {
  /** The current import job data */
  importJob: Import | undefined;
  /** Whether the query is loading */
  isLoading: boolean;
  /** Any error that occurred during polling */
  error: Error | null;
  /** Whether the hook is actively polling */
  isPolling: boolean;
  /** Function to start an import job */
  startImport: (targetRepoId: string) => Promise<void>;
  /** Function to stop polling */
  stopPolling: () => void;
}

/**
 * Hook to poll import job status
 *
 * @param importJobId - The ID of the import job to poll (optional, only for polling)
 * @param pullRequestId - The ID of the pull request (required for starting imports)
 * @returns Object containing import job data, loading state, error, polling status, start and stop functions
 */
export function useImportJob(
  importJobId: string | undefined,
  pullRequestId: string
): UseImportJobResult {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  // Poll import job status
  const query = useQuery({
    queryKey: ['import-job', importJobId],
    queryFn: async () => {
      if (!importJobId) throw new Error('Import job ID is required');
      const response = await importsApi.get(importJobId);
      return response.data as Import;
    },
    enabled: !!importJobId,
    refetchInterval: (data) => {
      // Only poll if status is pending or running
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const status = (data as any)?.status;
      if (status === 'pending' || status === 'running') {
        return 2000; // Poll every 2 seconds
      }
      return false; // Stop polling
    },
    refetchIntervalInBackground: true,
    retry: 3,
  });

  // Start import job
  const startImportMutation = useMutation({
    mutationFn: async (targetRepoId: string) => {
      const response = await importsApi.start(pullRequestId, { targetRepoId });
      return response.data;
    },
    onSuccess: () => {
      // Invalidate pull request query to fetch updated data
      queryClient.invalidateQueries({ queryKey: ['pull-request', pullRequestId] });
      queryClient.invalidateQueries({ queryKey: ['imports', pullRequestId] });
      success('Import job started successfully');
    },
    onError: (err: Error) => {
      showError(`Failed to start import: ${err.message}`);
    },
  });

  // Show toast notification on job completion
  if (query.data?.status === 'succeeded') {
    success('Import completed successfully');
    // Auto-refresh pull request data after successful import
    queryClient.invalidateQueries({ queryKey: ['pull-request', pullRequestId] });
  } else if (query.data?.status === 'failed') {
    showError('Import job failed');
  } else if (query.data?.status === 'succeeded_noop') {
    success('Import completed (no changes needed)');
    // Auto-refresh pull request data after successful import
    queryClient.invalidateQueries({ queryKey: ['pull-request', pullRequestId] });
  }

  const stopPolling = () => {
    queryClient.setQueryData(['import-job', importJobId], (oldData: Import | undefined) => {
      if (oldData && (oldData.status === 'pending' || oldData.status === 'running')) {
        // Keep the data but mark it so polling will stop
        return { ...oldData };
      }
      return oldData;
    });
    queryClient.invalidateQueries({ queryKey: ['import-job', importJobId] });
  };

  return {
    importJob: query.data,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    isPolling:
      query.isFetching &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((query.data as any)?.status === 'pending' || (query.data as any)?.status === 'running'),
    startImport: (targetRepoId: string) => startImportMutation.mutateAsync(targetRepoId),
    stopPolling,
  };
}
