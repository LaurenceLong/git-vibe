/**
 * ChecksTab Component
 *
 * Displays agent runs and CI-like status for a PR
 *
 * Features:
 * - Display list of agent runs with status
 * - Show agent run logs
 * - Provide trigger agent run action
 * - Show CI-like pass/fail indicators
 * - Reuse existing AgentRunsTab component logic
 */

import React, { useState, useEffect } from 'react';
import { AgentRun, WorktreeStatus } from '@/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { agentRunsApi } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { AgentRunConfigForm } from '@/components/agent/AgentRunConfigForm';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Bot, AlertTriangle } from 'lucide-react';

/**
 * Props for the ChecksTab component
 */
export interface ChecksTabProps {
  /** The PR ID (changesetId) */
  prId: string;
  /** List of agent runs for PR */
  agentRuns: AgentRun[];
  /** Worktree status */
  worktreeStatus?: WorktreeStatus;
}

/**
 * ChecksTab component
 * Displays agent runs and CI-like status for a PR
 */
export function ChecksTab({ prId, agentRuns, worktreeStatus = 'present' }: ChecksTabProps) {
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  // Track which runs are currently being polled
  const [pollingRuns, setPollingRuns] = useState<Set<string>>(new Set());

  // Add running/queued runs to polling
  useEffect(() => {
    const runningOrQueued = new Set(
      agentRuns
        .filter((run) => run.status === 'queued' || run.status === 'running')
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
      queryClient.invalidateQueries({ queryKey: ['agent-runs', prId] });
      success('Agent run cancelled successfully');
    },
    onError: (err: Error) => {
      showError(`Failed to cancel agent run: ${err.message}`);
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
      const response = await agentRunsApi.trigger(prId, {
        ...data,
        inputSummary: data.inputSummary || undefined,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-runs', prId] });
      success('Agent run triggered successfully');
      setIsConfigModalOpen(false);
    },
    onError: (err: Error) => {
      showError(`Failed to trigger agent run: ${err.message}`);
    },
  });

  // Handle config modal
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
    if (window.confirm('Are you sure you want to cancel this agent run?')) {
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

  // Calculate run duration
  const getDuration = (run: AgentRun): string => {
    if (!run.startedAt) return 'N/A';
    const end = run.finishedAt ? new Date(run.finishedAt) : new Date();
    const start = new Date(run.startedAt);
    const duration = Math.floor((end.getTime() - start.getTime()) / 1000);
    if (duration < 60) return `${duration}s`;
    return `${Math.floor(duration / 60)}m ${duration % 60}s`;
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
                The worktree for this PR is not available. Please recreate worktree before
                running agents.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
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
        {agentRuns.length > 0 ? (
          <div className="space-y-3">
            {agentRuns.map((run) => {
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
                        {run.startedAt ? new Date(run.startedAt).toLocaleString() : 'Not started'}
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
                            {new Date(run.finishedAt).toLocaleString()}
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
                          Logs will appear as agent runs...
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
