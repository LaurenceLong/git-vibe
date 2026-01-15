/**
 * useAgentRunPolling Hook
 *
 * Polls agent run status while in 'queued' or 'running' state.
 * Streams logs as they come in (appends to existing logs).
 * Stops polling when status changes to 'succeeded', 'failed', or 'cancelled'.
 *
 * @example
 * ```tsx
 * function AgentRunComponent({ agentRunId }: { agentRunId: string }) {
 *   const { agentRun, isLoading, error, isPolling, stopPolling } = useAgentRunPolling(agentRunId);
 *
 *   return (
 *     <div>
 *       <p>Status: {agentRun?.status}</p>
 *       <p>Is Polling: {isPolling}</p>
 *       <button onClick={stopPolling}>Stop Polling</button>
 *     </div>
 *   );
 * }
 * ```
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { agentRunsApi } from '../lib/api';
import { AgentRun } from '../types';

interface UseAgentRunPollingResult {
  /** The current agent run data */
  agentRun: AgentRun | undefined;
  /** Whether the query is loading */
  isLoading: boolean;
  /** Any error that occurred during polling */
  error: Error | null;
  /** Whether the hook is actively polling */
  isPolling: boolean;
  /** Function to stop polling */
  stopPolling: () => void;
}

/**
 * Hook to poll agent run status
 *
 * @param agentRunId - The ID of the agent run to poll
 * @returns Object containing agent run data, loading state, error, polling status, and stop function
 */
export function useAgentRunPolling(agentRunId: string): UseAgentRunPollingResult {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['agent-run', agentRunId],
    queryFn: async () => {
      const response = await agentRunsApi.get(agentRunId);
      return response.data as AgentRun;
    },
    refetchInterval: (data) => {
      // Only poll if status is queued or running
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const status = (data as any)?.status;
      if (status === 'queued' || status === 'running') {
        return 2000; // Poll every 2 seconds
      }
      return false; // Stop polling
    },
    refetchIntervalInBackground: true,
    retry: 3,
  });

  const stopPolling = () => {
    queryClient.setQueryData(['agent-run', agentRunId], (oldData: AgentRun | undefined) => {
      if (oldData && (oldData.status === 'queued' || oldData.status === 'running')) {
        // Keep the data but mark it so polling will stop
        return { ...oldData };
      }
      return oldData;
    });
    queryClient.invalidateQueries({ queryKey: ['agent-run', agentRunId] });
  };

  // Auto-refresh WorkItem data after successful run completion
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = query.data as any;
  if (data?.status === 'succeeded' && data?.workItemId && data?.headShaAfter) {
    queryClient.invalidateQueries({ queryKey: ['workitem', data.workItemId] });
  }

  return {
    agentRun: query.data,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    isPolling: query.isFetching && (data?.status === 'queued' || data?.status === 'running'),
    stopPolling,
  };
}
