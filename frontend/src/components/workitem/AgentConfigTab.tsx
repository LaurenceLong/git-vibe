/**
 * AgentConfigTab Component
 *
 * Displays agent configuration form and agent run history for this WorkItem
 *
 * Features:
 * - Display agent configuration form
 * - Allow selecting agent type
 * - Configure agent parameters
 * - Show agent run history for this WorkItem
 * - Trigger agent run button
 * - Show agent run status (queued/running/succeeded/failed)
 * - Display agent run logs
 * - Reuse existing AgentRunConfigForm component if possible
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { agentRunsApi } from '@/lib/api';
import { AgentRun, WorktreeStatus } from '@/types';
import { AgentRunConfigForm } from '@/components/agent/AgentRunConfigForm';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Bot, AlertTriangle } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { extractErrorMessage } from '@/lib/errorUtils';
import { useConfirmModal } from '@/components/ConfirmModal';
import { formatDateTime, formatDuration } from '@/lib/datetime';

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
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const { confirm } = useConfirmModal();

  // Track which runs are currently being polled
  const [pollingRuns, setPollingRuns] = useState<Set<string>>(new Set());

  // Fetch agent runs for this WorkItem - only when tab is active
  const { data: agentRuns, isLoading } = useQuery({
    queryKey: ['agent-runs', workItemId],
    queryFn: async () => {
      const response = await agentRunsApi.listByWorkItem(workItemId);
      return (response.data || []) as AgentRun[];
    },
    enabled: isActive,
    refetchInterval: (data) => {
      if (!isActive) return false;
      // Ensure data is an array before calling .some()
      if (!Array.isArray(data)) {
        return false;
      }
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
      queryClient.invalidateQueries({ queryKey: ['agent-runs', workItemId] });
      success('Agent run cancelled successfully');
    },
    onError: (err: unknown) => {
      const errorMessage = extractErrorMessage(err, 'Failed to cancel agent run');
      showError(errorMessage);
    },
  });

  // Trigger agent run mutation
  const triggerMutation = useMutation({
    mutationFn: async (data: {
      agentKey: string;
      inputSummary?: string;
      prompt: string;
      config: { executablePath: string; baseArgs?: string[] };
    }) => {
      const response = await agentRunsApi.trigger(workItemId, {
        agentKey: data.agentKey,
        inputSummary: data.inputSummary,
        prompt: data.prompt,
        config: data.config,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-runs', workItemId] });
      queryClient.invalidateQueries({ queryKey: ['workitem', workItemId] });
      success('Agent run triggered successfully');
      setIsConfigModalOpen(false);
    },
    onError: (err: unknown) => {
      const errorMessage = extractErrorMessage(err, 'Failed to trigger agent run');
      showError(errorMessage);
    },
  });

  const handleOpenConfigModal = () => {
    setIsConfigModalOpen(true);
  };

  const handleCloseConfigModal = () => {
    setIsConfigModalOpen(false);
  };

  const handleTriggerRun = async (data: {
    agentKey: string;
    inputSummary?: string;
    prompt: string;
    config: { executablePath: string; baseArgs?: string[] };
  }) => {
    await triggerMutation.mutateAsync(data);
  };

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

      {/* Header with trigger button */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Agent Runs</h2>
          <Button
            variant="primary"
            size="sm"
            onClick={handleOpenConfigModal}
            disabled={!isWorktreePresent}
          >
            Trigger Agent Run
          </Button>
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
                      <div className="mb-1 flex items-center space-x-2">
                        <StatusBadge status={getStatusType(run.status)}>
                          {run.status}
                          {isPolling && <span className="ml-1 inline-block animate-pulse">●</span>}
                        </StatusBadge>
                        <span className="font-semibold text-gray-900">{run.agentKey}</span>
                      </div>
                      <div className="text-sm text-gray-600">
                        {run.startedAt ? formatDateTime(run.startedAt) : 'Not started'}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
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
                      <Button variant="ghost" size="sm" onClick={() => toggleRunExpansion(run.id)}>
                        {isExpanded ? '▼' : '▶'}
                      </Button>
                    </div>
                  </div>

                  {/* Run Details */}
                  {isExpanded && (
                    <div className="mt-3 space-y-3">
                      {/* Input Summary */}
                      {run.inputSummary && (
                        <div>
                          <h4 className="mb-1 text-sm font-medium text-gray-700">Summary</h4>
                          <p className="text-sm text-gray-600">{run.inputSummary}</p>
                        </div>
                      )}

                      {/* Run Details */}
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="font-medium">Duration:</span> {getDuration(run)}
                        </div>
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
                        {run.finishedAt && (
                          <div>
                            <span className="font-medium">Finished:</span>{' '}
                            {formatDateTime(run.finishedAt)}
                          </div>
                        )}
                      </div>

                      {/* Logs */}
                      {run.log && (
                        <div>
                          <h4 className="mb-1 text-sm font-medium text-gray-700">Logs</h4>
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
            description="Agent runs will appear here when agents are executed"
            action={
              <Button
                variant="primary"
                size="sm"
                onClick={handleOpenConfigModal}
                disabled={!isWorktreePresent}
              >
                Trigger Agent Run
              </Button>
            }
          />
        )}
      </div>

      {/* Trigger Agent Run Modal */}
      <Modal
        isOpen={isConfigModalOpen}
        onClose={handleCloseConfigModal}
        title="Trigger Agent Run"
        size="lg"
      >
        <AgentRunConfigForm
          onSubmit={handleTriggerRun}
          onCancel={handleCloseConfigModal}
          isLoading={triggerMutation.isPending}
        />
      </Modal>
    </div>
  );
}
