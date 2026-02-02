/**
 * TaskManagementTab Component
 *
 * Displays and manages agent tasks for a WorkItem
 * Supports cancel, resume, and restart operations
 */

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { agentRunsApi } from '@/lib/api';
import {
  useTasks,
  useStartWorkItemTask,
  useCancelWorkItemTask,
  useRestartWorkItemTask,
  useResumeWorkItemTask,
} from '@/hooks/useWorkItem';
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
import { formatDateTime, sortDates } from '@/lib/datetime';
import { useConfirmModal } from '@/components/ConfirmModal';
import Convert from 'ansi-to-html';

export interface TaskManagementTabProps {
  workItemId: string;
  isActive?: boolean;
}

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
        agentRunsApi.getStdoutTail(agentRunId, 3),
        agentRunsApi.getStderrTail(agentRunId, 3),
      ]);
      return { stdout, stderr };
    },
    enabled: isExpanded, // Only fetch when expanded
    staleTime: 5000, // Cache for 5 seconds
  });

  // Initialize ANSI to HTML converter (same as LogPane)
  const ansiConverter = useMemo(
    () =>
      new Convert({
        fg: '#fff',
        bg: '#000',
        newline: true,
        escapeXML: true,
        stream: false,
      }),
    []
  );

  // Convert ANSI escape codes to HTML for stdout
  const stdoutHtml = useMemo(() => {
    if (!logs?.stdout) return '';
    return ansiConverter.toHtml(logs.stdout);
  }, [logs?.stdout, ansiConverter]);

  // Convert ANSI escape codes to HTML for stderr
  const stderrHtml = useMemo(() => {
    if (!logs?.stderr) return '';
    return ansiConverter.toHtml(logs.stderr);
  }, [logs?.stderr, ansiConverter]);

  if (!isExpanded) {
    return null;
  }

  return (
    <div className="mt-3">
      {isLoading ? (
        <div className="flex items-center justify-center space-x-2 rounded-md bg-gray-900 p-3 text-sm text-gray-400">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-600 border-t-blue-400" />
          <span>Loading preview...</span>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center space-x-2 rounded-md bg-gray-900 p-3 text-sm text-red-400">
          <AlertCircle className="h-4 w-4" />
          <span>Unable to load preview</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Stdout Pane */}
          <div className="rounded-md bg-gray-900 p-3">
            <div className="mb-1 flex items-center space-x-2">
              <Terminal className="h-3 w-3 text-green-400" />
              <span className="text-xs font-medium text-gray-400">Stdout</span>
            </div>
            {stdoutHtml ? (
              <pre
                className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-gray-300"
                dangerouslySetInnerHTML={{ __html: stdoutHtml }}
              />
            ) : (
              <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-gray-500">
                No output
              </pre>
            )}
          </div>

          {/* Stderr Pane */}
          <div className="rounded-md bg-gray-900 p-3">
            <div className="mb-1 flex items-center space-x-2">
              <Terminal className="h-3 w-3 text-red-400" />
              <span className="text-xs font-medium text-gray-400">Stderr</span>
            </div>
            {stderrHtml ? (
              <pre
                className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-red-300"
                dangerouslySetInnerHTML={{ __html: stderrHtml }}
              />
            ) : (
              <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-gray-500">
                No output
              </pre>
            )}
          </div>
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
  const [resumePrompt, setResumePrompt] = useState('');
  const [showResumeDialog, setShowResumeDialog] = useState<string | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [expandedPrompts, setExpandedPrompts] = useState<Set<string>>(new Set());
  const { confirm } = useConfirmModal();

  const {
    data: tasksData,
    isLoading: loading,
    isError,
    error: queryError,
  } = useTasks(workItemId, {
    enabled: isActive,
    refetchInterval: (data) =>
      data?.some((t) => t.status === 'running' || t.status === 'queued') ? 2000 : false,
  });

  const tasks = useMemo(() => {
    if (!tasksData) return [];
    return [...tasksData].sort((a, b) =>
      sortDates(a.createdAt || '', b.createdAt || '', 'asc')
    ) as AgentRun[];
  }, [tasksData]);

  const { startTask, isLoading: isStarting } = useStartWorkItemTask(workItemId);
  const {
    cancelTask,
    isLoading: isCancelling,
    isCancellingTaskId,
  } = useCancelWorkItemTask(workItemId);
  const {
    restartTask,
    isLoading: isRestarting,
    isRestartingTaskId,
  } = useRestartWorkItemTask(workItemId);
  const { resumeTask, isLoading: isResuming } = useResumeWorkItemTask(workItemId);

  const error = isError
    ? queryError instanceof Error
      ? queryError.message
      : 'Failed to fetch tasks'
    : null;

  const handleCancel = async (taskId: string) => {
    if (!(await confirm({ message: 'Are you sure you want to cancel this task?' }))) return;
    await cancelTask(taskId);
  };

  const handleRestart = async (taskId: string) => {
    if (
      !(await confirm({
        message:
          'Are you sure you want to restart this task? This will create a new task with the same prompt.',
      }))
    )
      return;
    await restartTask(taskId);
  };

  const handleResume = async (taskId: string) => {
    if (!resumePrompt.trim()) return;
    await resumeTask(taskId, resumePrompt);
    setResumePrompt('');
    setShowResumeDialog(null);
  };

  const handleStart = async () => {
    await startTask();
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

  // Toggle expanded state for prompt
  const togglePromptExpanded = (taskId: string) => {
    setExpandedPrompts((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
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
          // Number tasks in order since they're sorted oldest first (Task #1 is oldest)
          const taskNumber = index + 1;
          return (
            <div
              key={task.id}
              className="rounded-lg border bg-white p-4 shadow-sm transition-colors hover:bg-gray-50"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="mb-2 flex items-center space-x-2">
                    <span className="text-xs font-medium text-gray-500">Task #{taskNumber}</span>
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
                    <div className="mb-3">
                      <div className="relative">
                        <p
                          className={`whitespace-pre-wrap text-sm text-gray-700 ${
                            expandedPrompts.has(task.id) ? '' : 'line-clamp-5'
                          }`}
                        >
                          {task.inputSummary}
                        </p>
                        {hasMultipleLines(task.inputSummary) && (
                          <button
                            onClick={() => togglePromptExpanded(task.id)}
                            className="mt-1 text-xs font-medium text-blue-600 hover:text-blue-800"
                          >
                            {expandedPrompts.has(task.id) ? 'Show less' : 'Show more'}
                          </button>
                        )}
                      </div>
                    </div>
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
                      loading={isCancelling && isCancellingTaskId === task.id}
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
                        loading={isRestarting && isRestartingTaskId === task.id}
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
                      loading={isRestarting && isRestartingTaskId === task.id}
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
                    <Button size="sm" onClick={() => handleResume(task.id)} loading={isResuming}>
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
