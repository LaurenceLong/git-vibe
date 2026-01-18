/**
 * ConversationTab Component
 *
 * Displays PR conversation comments (non-code review comments)
 *
 * Features:
 * - Display PR description/body
 * - Show comment thread
 * - Allow adding comments
 * - Show timestamps for each comment
 * - Use empty state when no comments exist
 * - For personal projects: user ↔ agent conversation, auto-create task on message, show streaming stdout/stderr
 * - Proper streaming log panels with SSE support
 */

import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Clock, Terminal, User, Bot } from 'lucide-react';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/Toast';
import { workItemsApi } from '@/lib/api';
import { formatDateTime } from '@/lib/datetime';
import { LogPane } from '@/components/workitem/LogDetailTab';

export interface ConversationTabProps {
  prId: string;
  workItemId: string;
  isActive?: boolean;
}

interface TaskMessageProps {
  task: {
    id: string;
    inputSummary: string | null;
    status: string;
    createdAt: string;
    finishedAt: string | null;
  };
  logs: { stdout: string; stderr: string };
  streamingState: {
    isLoading: boolean;
    isStreaming: boolean;
    sseConnected: boolean;
  };
}

/**
 * TaskMessage component - renders a single task with its logs
 */
function TaskMessage({ task, logs, streamingState }: TaskMessageProps) {
  const [showStdoutCopyFeedback, setShowStdoutCopyFeedback] = useState(false);
  const [showStderrCopyFeedback, setShowStderrCopyFeedback] = useState(false);

  return (
    <div key={task.id} className="space-y-3">
      {/* User Message (task input) */}
      {task.inputSummary && (
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
              <User className="h-4 w-4 text-blue-600" />
            </div>
          </div>
          <div className="flex-1 rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-900">You</span>
              <div className="flex items-center space-x-1 text-xs text-gray-500">
                <Clock className="h-3 w-3" />
                <span>{formatDateTime(task.createdAt)}</span>
              </div>
            </div>
            <p className="whitespace-pre-wrap text-gray-700">{task.inputSummary}</p>
          </div>
        </div>
      )}

      {/* Agent Response (task output/logs) */}
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
            <Bot className="h-4 w-4 text-green-600" />
          </div>
        </div>
        <div className="flex-1 rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 bg-gray-50 px-4 py-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-900">Agent</span>
              <div className="flex items-center space-x-2">
                <span className="rounded-md bg-gray-200 px-2 py-0.5 text-xs text-gray-700">
                  {task.status}
                </span>
                {task.finishedAt && (
                  <div className="flex items-center space-x-1 text-xs text-gray-500">
                    <Clock className="h-3 w-3" />
                    <span>{formatDateTime(task.finishedAt)}</span>
                  </div>
                )}
                {streamingState.isStreaming && !streamingState.isLoading && (
                  <span className="flex items-center space-x-1 text-xs text-green-600">
                    <div className="h-2 w-2 animate-pulse rounded-full bg-green-600" />
                    <span>Streaming</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Streaming Logs Panel - Always visible */}
          <div className="p-4">
            <div className="mb-3 flex items-center space-x-2">
              <Terminal className="h-4 w-4 text-gray-500" />
              <span className="text-xs font-medium text-gray-700">Agent Output</span>
            </div>

            {/* Log Panes */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {/* Stdout Pane */}
              <div className="h-[300px]">
                <LogPane
                  title="Stdout"
                  content={logs.stdout}
                  accentColor="text-green-400"
                  onCopy={async () => {
                    if (logs.stdout) {
                      try {
                        await navigator.clipboard.writeText(logs.stdout);
                        setShowStdoutCopyFeedback(true);
                        setTimeout(() => setShowStdoutCopyFeedback(false), 2000);
                      } catch (err) {
                        console.error('Failed to copy stdout:', err);
                      }
                    }
                  }}
                  showCopyFeedback={showStdoutCopyFeedback}
                  isStreaming={streamingState.isStreaming && streamingState.sseConnected}
                  isLoading={streamingState.isLoading && !streamingState.sseConnected}
                />
              </div>

              {/* Stderr Pane */}
              <div className="h-[300px]">
                <LogPane
                  title="Stderr"
                  content={logs.stderr}
                  accentColor="text-red-400"
                  onCopy={async () => {
                    if (logs.stderr) {
                      try {
                        await navigator.clipboard.writeText(logs.stderr);
                        setShowStderrCopyFeedback(true);
                        setTimeout(() => setShowStderrCopyFeedback(false), 2000);
                      } catch (err) {
                        console.error('Failed to copy stderr:', err);
                      }
                    }
                  }}
                  showCopyFeedback={showStderrCopyFeedback}
                  isStreaming={streamingState.isStreaming && streamingState.sseConnected}
                  isLoading={streamingState.isLoading && !streamingState.sseConnected}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * ConversationTab component
 *
 * @param prId - The ID of PR to display comments for
 * @param workItemId - The ID of WorkItem associated with this PR
 */
export function ConversationTab({ prId: _prId, workItemId, isActive = true }: ConversationTabProps) {
  const [newMessage, setNewMessage] = useState('');
  const [taskLogs, setTaskLogs] = useState<Record<string, { stdout: string; stderr: string }>>({});
  const [taskStreamingStates, setTaskStreamingStates] = useState<
    Record<string, { isLoading: boolean; isStreaming: boolean; sseConnected: boolean }>
  >({});
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const eventSourcesRef = useRef<Record<string, EventSource>>({});
  const hasReceivedLogsRef = useRef<Record<string, { stdout: boolean; stderr: boolean }>>({});

  // Fetch tasks for this work item - only when tab is active
  const { data: tasks } = useQuery({
    queryKey: ['workitem-tasks', workItemId],
    queryFn: async () => {
      const response = await workItemsApi.getTasks(workItemId);
      return response.data as Array<{
        id: string;
        inputSummary: string | null;
        status: string;
        createdAt: string;
        finishedAt: string | null;
      }>;
    },
    enabled: isActive && !!workItemId,
  });

  // Set up SSE streaming for each task
  useEffect(() => {
    if (!tasks || !isActive) return;

    // Clean up old event sources for tasks that no longer exist
    const currentTaskIds = new Set(tasks.map((t) => t.id));
    Object.keys(eventSourcesRef.current).forEach((taskId) => {
      if (!currentTaskIds.has(taskId)) {
        eventSourcesRef.current[taskId]?.close();
        delete eventSourcesRef.current[taskId];
        delete hasReceivedLogsRef.current[taskId];
        setTaskStreamingStates((prev) => {
          const newState = { ...prev };
          delete newState[taskId];
          return newState;
        });
      }
    });

    // Set up SSE for each task
    tasks.forEach((task) => {
      // Skip if already set up
      if (eventSourcesRef.current[task.id]) return;

      // Only set up SSE for running tasks or the latest task
      const isLatestTask = tasks[tasks.length - 1]?.id === task.id;
      if (task.status !== 'running' && !isLatestTask) return;

      // Initialize state
      setTaskStreamingStates((prev) => ({
        ...prev,
        [task.id]: { isLoading: true, isStreaming: false, sseConnected: false },
      }));
      hasReceivedLogsRef.current[task.id] = { stdout: false, stderr: false };

      // Create SSE connection
      const eventSource = new EventSource(`/api/agent-runs/${task.id}/logs/stream`);
      eventSourcesRef.current[task.id] = eventSource;

      // Handle stdout events
      eventSource.addEventListener('stdout', (event) => {
        try {
          const data = JSON.parse(event.data) as string;
          if (data) {
            setTaskLogs((prev) => ({
              ...prev,
              [task.id]: {
                ...prev[task.id],
                stdout: (prev[task.id]?.stdout || '') + data,
              },
            }));
            hasReceivedLogsRef.current[task.id].stdout = true;
          }
          setTaskStreamingStates((prev) => ({
            ...prev,
            [task.id]: {
              ...prev[task.id],
              isStreaming: true,
              isLoading: false,
            },
          }));
        } catch (err) {
          console.error('Failed to parse stdout event:', err);
        }
      });

      // Handle stderr events
      eventSource.addEventListener('stderr', (event) => {
        try {
          const data = JSON.parse(event.data) as string;
          if (data) {
            setTaskLogs((prev) => ({
              ...prev,
              [task.id]: {
                ...prev[task.id],
                stderr: (prev[task.id]?.stderr || '') + data,
              },
            }));
            hasReceivedLogsRef.current[task.id].stderr = true;
          }
          setTaskStreamingStates((prev) => ({
            ...prev,
            [task.id]: {
              ...prev[task.id],
              isStreaming: true,
              isLoading: false,
            },
          }));
        } catch (err) {
          console.error('Failed to parse stderr event:', err);
        }
      });

      // Handle errors
      eventSource.onerror = (err) => {
        console.error('SSE error:', err);
        if (eventSource.readyState === EventSource.CLOSED) {
          eventSource.close();
          setTaskStreamingStates((prev) => ({
            ...prev,
            [task.id]: {
              ...prev[task.id],
              isStreaming: false,
              sseConnected: false,
            },
          }));
        }
      };

      // Handle open event - connection established
      eventSource.onopen = () => {
        setTaskStreamingStates((prev) => ({
          ...prev,
          [task.id]: {
            ...prev[task.id],
            sseConnected: true,
            isStreaming: true,
          },
        }));
      };

      // Cleanup on unmount or when task changes
      return () => {
        eventSource.close();
        delete eventSourcesRef.current[task.id];
        delete hasReceivedLogsRef.current[task.id];
        setTaskStreamingStates((prev) => {
          const newState = { ...prev };
          delete newState[task.id];
          return newState;
        });
      };
    });

    // Cleanup all event sources when component unmounts
    return () => {
      Object.values(eventSourcesRef.current).forEach((es) => es.close());
      eventSourcesRef.current = {};
      hasReceivedLogsRef.current = {};
      setTaskStreamingStates({});
    };
  }, [tasks, isActive]);

  // Fetch initial logs as a fallback for completed tasks
  useEffect(() => {
    if (!tasks || !isActive) return;

    const fetchInitialLogs = async (taskId: string) => {
      const streamingState = taskStreamingStates[taskId];
      const hasReceivedLogs = hasReceivedLogsRef.current[taskId];

      // Skip if already received logs via SSE
      if (streamingState?.sseConnected && (hasReceivedLogs?.stdout || hasReceivedLogs?.stderr)) {
        setTaskStreamingStates((prev) => ({
          ...prev,
          [taskId]: { ...prev[taskId], isLoading: false },
        }));
        return;
      }

      try {
        const response = await fetch(`/api/agent-runs/${taskId}/logs`);
        if (!response.ok) throw new Error('Failed to fetch logs');
        const logs = await response.json();

        // Only update if we haven't received logs via SSE
        if (!hasReceivedLogs?.stdout && logs.stdout) {
          setTaskLogs((prev) => ({
            ...prev,
            [taskId]: { ...prev[taskId], stdout: logs.stdout },
          }));
          if (hasReceivedLogsRef.current[taskId]) {
            hasReceivedLogsRef.current[taskId].stdout = true;
          } else {
            hasReceivedLogsRef.current[taskId] = { stdout: true, stderr: false };
          }
        }
        if (!hasReceivedLogs?.stderr && logs.stderr) {
          setTaskLogs((prev) => ({
            ...prev,
            [taskId]: { ...prev[taskId], stderr: logs.stderr },
          }));
          if (hasReceivedLogsRef.current[taskId]) {
            hasReceivedLogsRef.current[taskId].stderr = true;
          } else {
            hasReceivedLogsRef.current[taskId] = { stdout: false, stderr: true };
          }
        }
        setTaskStreamingStates((prev) => ({
          ...prev,
          [taskId]: { ...prev[taskId], isLoading: false },
        }));
      } catch (err) {
        console.error('Failed to fetch initial logs:', err);
        if (!streamingState?.sseConnected) {
          setTaskStreamingStates((prev) => ({
            ...prev,
            [taskId]: { ...prev[taskId], isLoading: false },
          }));
        }
      }
    };

    // Fetch logs for each task
    tasks.forEach((task) => {
      // Only fetch if not already set up with SSE
      if (!eventSourcesRef.current[task.id]) {
        fetchInitialLogs(task.id);
      }
    });
  }, [tasks, isActive, taskStreamingStates]);

  // Create task mutation (for personal projects - user ↔ agent)
  const createTaskMutation = useMutation({
    mutationFn: async () => {
      // Start a task with the user's message
      const response = await workItemsApi.startTask(workItemId);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workitem-tasks', workItemId] });
      setNewMessage('');
      success('Task created and started');
    },
    onError: (err: Error) => {
      showError(`Failed to create task: ${err.message}`);
    },
  });

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    // For personal projects: auto-create a task with the message
    await createTaskMutation.mutateAsync();
  };

  return (
    <div className="space-y-6">
      {/* Message Composer (User ↔ Agent for personal projects) */}
      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <form onSubmit={handleSendMessage}>
          <label htmlFor="message" className="mb-2 block text-sm font-medium text-gray-700">
            Send a message to the agent
          </label>
          <Textarea
            id="message"
            rows={5}
            className="w-full"
            placeholder="Type your message... (This will create a task to run the agent)"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            disabled={createTaskMutation.isPending}
          />
          <div className="mt-3 flex justify-end">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={createTaskMutation.isPending}
              disabled={!newMessage.trim()}
            >
              Send
            </Button>
          </div>
        </form>
      </div>

      {/* Conversation Thread (Tasks as messages) */}
      {tasks && tasks.length > 0 ? (
        <div className="space-y-4">
          {tasks.map((task) => {
            const logs = taskLogs[task.id] || { stdout: '', stderr: '' };
            const streamingState = taskStreamingStates[task.id] || {
              isLoading: false,
              isStreaming: false,
              sseConnected: false,
            };

            return <TaskMessage key={task.id} task={task} logs={logs} streamingState={streamingState} />;
          })}
        </div>
      ) : (
        <EmptyState
          icon={MessageSquare}
          title="No conversation yet"
          description="Send a message to start a conversation with the agent"
        />
      )}
    </div>
  );
}
