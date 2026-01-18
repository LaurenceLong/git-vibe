/**
 * TaskManagementTab Component
 *
 * Displays and manages agent tasks for a WorkItem
 * Supports cancel, resume, and restart operations
 */

import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { workItemsApi, agentRunsApi } from '@/lib/api';
import { useStartWorkItemTask } from '@/hooks/useWorkItem';
import type { AgentRun } from 'git-vibe-shared';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Play,
  Square,
  RotateCcw,
  AlertCircle,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Terminal,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { formatDateTime } from '@/lib/datetime';

export interface TaskManagementTabProps {
  workItemId: string;
  isActive?: boolean;
}

type TaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

/**
 * LogPreview component for displaying log previews
 */
function LogPreview({
  agentRunId,
  isExpanded,
  onToggle: _onToggle,
}: {
  agentRunId: string;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const {
    data: logs,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['agent-run-preview', agentRunId],
    queryFn: async () => {
      const [stdout, stderr] = await Promise.all([
        agentRunsApi.getStdoutTail(agentRunId, 5),
        agentRunsApi.getStderrTail(agentRunId, 5),
      ]);
      return { stdout, stderr };
    },
    enabled: isExpanded, // Only fetch when expanded
    staleTime: 5000, // Cache for 5 seconds
  });

  if (!isExpanded) {
    return null;
  }

  return (
    <div className="mt-3 rounded-md bg-gray-900 p-3">
      {isLoading ? (
        <div className="flex items-center space-x-2 text-sm text-gray-400">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-600 border-t-blue-400" />
          <span>Loading preview...</span>
        </div>
      ) : error ? (
        <div className="flex items-center space-x-2 text-sm text-red-400">
          <AlertCircle className="h-4 w-4" />
          <span>Unable to load preview</span>
        </div>
      ) : (
        <div className="space-y-2">
          {logs?.stdout && (
            <div>
              <div className="mb-1 flex items-center space-x-2">
                <Terminal className="h-3 w-3 text-green-400" />
                <span className="text-xs font-medium text-gray-400">Stdout</span>
              </div>
              <pre className="overflow-x-auto text-xs text-gray-300">
                {logs.stdout || <span className="text-gray-500">No output</span>}
              </pre>
            </div>
          )}
          {logs?.stderr && (
            <div className="mt-2">
              <div className="mb-1 flex items-center space-x-2">
                <Terminal className="h-3 w-3 text-red-400" />
                <span className="text-xs font-medium text-gray-400">Stderr</span>
              </div>
              <pre className="overflow-x-auto text-xs text-red-300">{logs.stderr}</pre>
            </div>
          )}
          {!logs?.stdout && !logs?.stderr && (
            <p className="text-xs text-gray-500">No logs available</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * TaskManagementTab component
 *
 * @param workItemId - The ID of WorkItem to display tasks for
 */
export function TaskManagementTab({ workItemId, isActive = true }: TaskManagementTabProps) {
  const [tasks, setTasks] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pollingTaskId, setPollingTaskId] = useState<string | null>(null);
  const [resumePrompt, setResumePrompt] = useState('');
  const [showResumeDialog, setShowResumeDialog] = useState<string | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const { startTask, isLoading: isStarting } = useStartWorkItemTask(workItemId);

  // Fetch tasks
  const fetchTasks = useCallback(async () => {
    try {
      setError(null);
      const response = await workItemsApi.getTasks(workItemId);
      setTasks(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tasks');
    } finally {
      setLoading(false);
    }
  }, [workItemId]);

  // Only fetch when tab is active
  useEffect(() => {
    if (isActive) {
      fetchTasks();
    }
  }, [workItemId, isActive, fetchTasks]);

  // Poll for running tasks
  useEffect(() => {
    const runningTasks = tasks.filter((t) => t.status === 'running');
    if (runningTasks.length === 0) {
      setPollingTaskId(null);
      return;
    }

    // Poll the first running task
    const taskId = runningTasks[0].id;
    if (pollingTaskId !== taskId) {
      setPollingTaskId(taskId);
    }

    const interval = setInterval(async () => {
      try {
        const response = await workItemsApi.getTaskStatus(workItemId, taskId);
        // Update the task status in the list
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? { ...t, status: (response.data?.status as TaskStatus) ?? t.status }
              : t
          )
        );
      } catch (err) {
        console.error('Failed to poll task status:', err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [tasks, pollingTaskId, workItemId]);

  // Cancel task
  const handleCancel = async (taskId: string) => {
    if (!window.confirm('Are you sure you want to cancel this task?')) {
      return;
    }

    try {
      await workItemsApi.cancelTask(workItemId, taskId);
      await fetchTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel task');
    }
  };

  // Restart task
  const handleRestart = async (taskId: string) => {
    if (
      !window.confirm(
        'Are you sure you want to restart this task? This will create a new task with the same prompt.'
      )
    ) {
      return;
    }

    try {
      await workItemsApi.restartTask(workItemId, taskId);
      await fetchTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restart task');
    }
  };

  // Resume task
  const handleResume = async (taskId: string) => {
    if (!resumePrompt.trim()) {
      setError('Please enter a prompt to resume the task');
      return;
    }

    try {
      await workItemsApi.resumeTask(workItemId, taskId, resumePrompt);
      setResumePrompt('');
      setShowResumeDialog(null);
      await fetchTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume task');
    }
  };

  // Handle start task
  const handleStart = async () => {
    try {
      await startTask();
      await fetchTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start task');
    }
  };

  // Toggle expanded state for task log preview
  const toggleExpanded = (taskId: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  // Get status type for badge
  const getStatusType = (status: string): 'success' | 'error' | 'info' | 'neutral' | 'warning' => {
    switch (status) {
      case 'succeeded':
        return 'success';
      case 'failed':
        return 'error';
      case 'running':
        return 'info';
      case 'cancelled':
        return 'neutral';
      case 'queued':
        return 'warning';
      default:
        return 'neutral';
    }
  };

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case 'succeeded':
        return <CheckCircle className="h-4 w-4" />;
      case 'failed':
        return <XCircle className="h-4 w-4" />;
      case 'cancelled':
        return <Square className="h-4 w-4" />;
      case 'queued':
        return <Clock className="h-4 w-4" />;
      default:
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  // Format date (using datetime helper)
  const formatTaskDate = (dateString: string | null) => {
    return formatDateTime(dateString);
  };

  // Loading state
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="flex items-start space-x-3">
          <AlertCircle className="mt-0.5 h-5 w-5 text-red-600" />
          <div>
            <h3 className="font-medium text-red-900">Error</h3>
            <p className="mt-1 text-sm text-red-700">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // No tasks
  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-12 text-center">
        <Clock className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-4 text-lg font-medium text-gray-900">No tasks yet</h3>
        <p className="mt-2 text-sm text-gray-600">
          Start a task to begin working on this WorkItem.
        </p>
        <div className="mt-6">
          <Button variant="primary" onClick={handleStart} loading={isStarting}>
            <Play className="mr-2 h-4 w-4" />
            Start Task
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tasks List */}
      <div className="space-y-3">
        {tasks.map((task, index) => {
          const isExpanded = expandedTasks.has(task.id);
          return (
            <div
              key={task.id}
              className="rounded-lg border bg-white p-4 shadow-sm transition-colors hover:bg-gray-50"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="mb-2 flex items-center space-x-2">
                    <span className="text-xs font-medium text-gray-500">Task #{index + 1}</span>
                    <StatusBadge status={getStatusType(task.status)}>
                      <span className="flex items-center space-x-1">
                        {getStatusIcon(task.status)}
                        <span>{task.status}</span>
                      </span>
                    </StatusBadge>
                    {task.linkedAgentRunId && (
                      <span className="rounded-md bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
                        Resumed from previous task
                      </span>
                    )}
                  </div>

                  {task.inputSummary && (
                    <p className="mb-3 text-sm text-gray-700">{task.inputSummary}</p>
                  )}

                  {/* Metadata */}
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 sm:grid-cols-4">
                    <div>
                      <span className="font-medium">Started:</span> {formatTaskDate(task.startedAt)}
                    </div>
                    <div>
                      <span className="font-medium">Finished:</span>{' '}
                      {formatTaskDate(task.finishedAt)}
                    </div>
                    <div>
                      <span className="font-medium">Agent:</span> {task.agentKey}
                    </div>
                    <div>
                      <span className="font-medium">Session:</span> {task.sessionId || '-'}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="ml-4 flex flex-col space-y-2">
                  {/* Logs button */}
                  <button
                    onClick={() => toggleExpanded(task.id)}
                    className="flex items-center space-x-1 rounded-md px-2 py-1 text-sm font-medium text-gray-600 hover:bg-gray-100"
                    title="Toggle log preview"
                  >
                    <Terminal className="h-4 w-4" />
                    <span>Logs</span>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                  {task.status === 'running' && (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleCancel(task.id)}
                      className="w-full"
                    >
                      <Square className="mr-1 h-3 w-3" />
                      Cancel
                    </Button>
                  )}
                  {task.status !== 'running' && task.sessionId && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowResumeDialog(task.id)}
                        className="w-full"
                      >
                        <Play className="mr-1 h-3 w-3" />
                        Resume
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRestart(task.id)}
                        className="w-full"
                      >
                        <RotateCcw className="mr-1 h-3 w-3" />
                        Restart
                      </Button>
                    </>
                  )}
                  {!task.sessionId && task.status !== 'running' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRestart(task.id)}
                      className="w-full"
                    >
                      <RotateCcw className="mr-1 h-3 w-3" />
                      Restart
                    </Button>
                  )}
                </div>
              </div>

              {/* Log Preview */}
              <LogPreview
                agentRunId={task.id}
                isExpanded={isExpanded}
                onToggle={() => toggleExpanded(task.id)}
              />

              {/* Resume Dialog */}
              {showResumeDialog === task.id && (
                <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <h4 className="mb-2 text-sm font-medium text-gray-900">Resume Task</h4>
                  <p className="mb-3 text-xs text-gray-600">
                    This will continue the task using the same session ID. Provide additional
                    instructions or corrections.
                  </p>
                  <textarea
                    value={resumePrompt}
                    onChange={(e) => setResumePrompt(e.target.value)}
                    placeholder="Enter additional instructions or corrections..."
                    className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    rows={3}
                  />
                  <div className="flex justify-end space-x-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setShowResumeDialog(null);
                        setResumePrompt('');
                      }}
                    >
                      Cancel
                    </Button>
                    <Button size="sm" onClick={() => handleResume(task.id)}>
                      <Play className="mr-1 h-3 w-3" />
                      Resume
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
