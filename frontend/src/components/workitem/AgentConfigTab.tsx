/**
 * AgentConfigTab Component
 *
 * Displays agent run history for this WorkItem
 *
 * Features:
 * - Show agent run history for this WorkItem
 * - Show agent run status (queued/running/succeeded/failed)
 * - Display detailed agent run information
 * - Display agent run logs
 * - Cancel running agent runs
 * - Note: Agent runs are triggered by workflows, not manually
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { agentRunsApi } from '@/lib/api';
import { AgentRun, WorktreeStatus } from '@/types';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Bot, AlertTriangle, ChevronDown, ChevronUp, Clock, CheckCircle } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { extractErrorMessage } from '@/lib/errorUtils';
import { useConfirmModal } from '@/components/ConfirmModal';
import { formatDateTime, formatDuration } from '@/lib/datetime';
import { queryKeys } from '@/lib/queryKeys';

export interface AgentConfigTabProps {
  workItemId: string;
  worktreeStatus?: WorktreeStatus;
  isActive?: boolean;
}

/**
 * AgentConfigTab component
 *
 * @param workItemId - The ID of WorkItem to display agent runs for
 */
export function AgentConfigTab({
  workItemId,
  worktreeStatus = 'present',
  isActive = true,
}: AgentConfigTabProps) {
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());
  const [expandedPrompts, setExpandedPrompts] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const { confirm } = useConfirmModal();

  // Track which runs are currently being polled
  const [pollingRuns, setPollingRuns] = useState<Set<string>>(new Set());

  // Fetch agent runs (tasks) for this WorkItem - standard key ['tasks', workItemId]
  const { data: agentRuns, isLoading } = useQuery({
    queryKey: queryKeys.tasks(workItemId),
    queryFn: async () => {
      const response = await agentRunsApi.listByWorkItem(workItemId);
      return (response.data || []) as AgentRun[];
    },
    enabled: isActive,
    refetchInterval: (data) => {
      if (!isActive) return false;
      if (!Array.isArray(data)) return false;
      const hasActiveRuns = data.some(
        (run: AgentRun) => run.status === 'queued' || run.status === 'running'
      );
      return hasActiveRuns ? 2000 : false;
    },
  });

  // Add running/queued runs to polling
  useEffect(() => {
    const runningOrQueued = new Set(
      (agentRuns || [])
        .filter((run: AgentRun) => run.status === 'queued' || run.status === 'running')
        .map((run) => run.id)
    );
    setPollingRuns(runningOrQueued);
  }, [agentRuns]);

  // Cancel agent run mutation
  const cancelMutation = useMutation({
    mutationFn: async (runId: string) => {
      const response = await agentRunsApi.cancel(runId);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks(workItemId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workitem(workItemId) });
      success('Agent run cancelled successfully');
    },
    onError: (err: unknown) => {
      const errorMessage = extractErrorMessage(err, 'Failed to cancel agent run');
      showError(errorMessage);
    },
  });

  const handleCancelRun = async (runId: string) => {
    if (await confirm({ message: 'Are you sure you want to cancel this agent run?' })) {
      await cancelMutation.mutateAsync(runId);
    }
  };

  // Toggle run expansion
  const toggleRunExpansion = (runId: string) => {
    setExpandedRuns((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(runId)) {
        newSet.delete(runId);
      } else {
        newSet.add(runId);
      }
      return newSet;
    });
  };

  // Toggle expanded state for prompt
  const togglePromptExpanded = (runId: string) => {
    setExpandedPrompts((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) {
        next.delete(runId);
      } else {
        next.add(runId);
      }
      return next;
    });
  };

  // Check if prompt has multiple lines or exceeds 5 lines
  const hasMultipleLines = (text: string | null | undefined): boolean => {
    if (!text) return false;
    const lines = text.split('\n');
    // Show expand button if there are more than 5 lines, or if it's multi-line with substantial content
    return lines.length > 5 || (lines.length > 1 && text.length > 200);
  };

  // Get status type for badge
  const getStatusType = (status: string): 'success' | 'error' | 'info' | 'neutral' | 'warning' => {
    switch (status) {
      case 'queued':
        return 'warning';
      case 'running':
        return 'info';
      case 'succeeded':
        return 'success';
      case 'failed':
        return 'error';
      case 'cancelled':
        return 'neutral';
      default:
        return 'neutral';
    }
  };

  // Calculate run duration (using datetime helper)
  const getDuration = (run: AgentRun): string => {
    if (!run.startedAt) return 'N/A';
    return formatDuration(run.startedAt, run.finishedAt);
  };

  // Check if worktree is present
  const isWorktreePresent = worktreeStatus === 'present';

  return (
    <div className="space-y-6">
      {/* Worktree Warning */}
      {!isWorktreePresent && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-600" />
            <div>
              <h3 className="font-medium text-yellow-900">Worktree Not Available</h3>
              <p className="mt-1 text-sm text-yellow-800">
                The worktree for this WorkItem is not available. Please recreate the worktree before
                running agents.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Agent Runs</h2>
          <p className="mt-1 text-sm text-gray-600">
            Agent runs are triggered automatically by workflows
          </p>
        </div>

        {/* Agent Runs List */}
        {isLoading ? (
          <div className="py-12 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
            <p className="mt-2 text-sm text-gray-600">Loading agent runs...</p>
          </div>
        ) : agentRuns && agentRuns.length > 0 ? (
          <div className="space-y-3">
            {agentRuns.map((run: AgentRun) => {
              const isPolling = pollingRuns.has(run.id);
              const isExpanded = expandedRuns.has(run.id);

              return (
                <div key={run.id} className="rounded-md border p-4">
                  {/* Run Header */}
                  <div className="mb-2 flex items-start justify-between">
                    <div className="flex-1">
                      <div className="mb-2 flex items-center space-x-2">
                        <StatusBadge status={getStatusType(run.status)}>
                          {run.status}
                          {isPolling && <span className="ml-1 inline-block animate-pulse">●</span>}
                        </StatusBadge>
                        <span className="font-semibold text-gray-900">{run.agentKey}</span>
                      </div>

                      {/* Summary */}
                      {run.inputSummary && (
                        <div className="mb-2">
                          <div className="relative">
                            <p
                              className={`whitespace-pre-wrap text-sm text-gray-700 ${
                                expandedPrompts.has(run.id) ? '' : 'line-clamp-5'
                              }`}
                            >
                              {run.inputSummary}
                            </p>
                            {hasMultipleLines(run.inputSummary) && (
                              <button
                                onClick={() => togglePromptExpanded(run.id)}
                                className="mt-1 text-xs font-medium text-blue-600 hover:text-blue-800"
                              >
                                {expandedPrompts.has(run.id) ? 'Show less' : 'Show more'}
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Metadata Grid */}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600 sm:grid-cols-4">
                        <div className="flex items-center space-x-1">
                          <Clock className="h-3 w-3" />
                          <span>
                            <span className="font-medium">Started:</span>{' '}
                            {run.startedAt ? formatDateTime(run.startedAt) : 'Not started'}
                          </span>
                        </div>
                        {run.finishedAt && (
                          <div className="flex items-center space-x-1">
                            <CheckCircle className="h-3 w-3" />
                            <span>
                              <span className="font-medium">Finished:</span>{' '}
                              {formatDateTime(run.finishedAt)}
                            </span>
                          </div>
                        )}
                        <div>
                          <span className="font-medium">Duration:</span> {getDuration(run)}
                        </div>
                        {run.sessionId && (
                          <div>
                            <span className="font-medium">Session:</span>{' '}
                            <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">
                              {run.sessionId.slice(0, 8)}
                            </code>
                          </div>
                        )}
                        {run.headShaBefore && (
                          <div>
                            <span className="font-medium">Before SHA:</span>{' '}
                            <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">
                              {run.headShaBefore.slice(0, 8)}
                            </code>
                          </div>
                        )}
                        {run.headShaAfter && (
                          <div>
                            <span className="font-medium">After SHA:</span>{' '}
                            <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">
                              {run.headShaAfter.slice(0, 8)}
                            </code>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="ml-4 flex items-center space-x-2">
                      {(run.status === 'queued' || run.status === 'running') && (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleCancelRun(run.id)}
                          loading={cancelMutation.isPending}
                        >
                          Cancel
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleRunExpansion(run.id)}
                        title={isExpanded ? 'Collapse details' : 'Expand details'}
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Run Details - Expanded */}
                  {isExpanded && (
                    <div className="mt-3 border-t pt-3">
                      {/* Logs */}
                      {run.log && (
                        <div>
                          <h4 className="mb-2 text-sm font-medium text-gray-700">Logs</h4>
                          <div className="max-h-64 overflow-auto rounded-md border bg-gray-50 p-3">
                            <pre className="whitespace-pre-wrap font-mono text-xs">{run.log}</pre>
                          </div>
                        </div>
                      )}

                      {/* No logs message for running runs */}
                      {!run.log && (run.status === 'queued' || run.status === 'running') && (
                        <div className="text-sm italic text-gray-500">
                          Logs will appear as the agent runs...
                        </div>
                      )}

                      {/* No logs message for completed runs */}
                      {!run.log && run.status !== 'queued' && run.status !== 'running' && (
                        <div className="text-sm text-gray-500">No logs available</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={Bot}
            title="No agent runs found"
            description="Agent runs will appear here when agents are executed by workflows"
          />
        )}
      </div>
    </div>
  );
}
