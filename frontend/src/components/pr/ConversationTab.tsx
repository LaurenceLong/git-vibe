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

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Clock, Terminal, User, Bot } from 'lucide-react';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/Toast';
import { workItemsApi } from '@/lib/api';
import { formatDateTime } from '@/lib/datetime';
import { LogPane } from '@/components/ui/LogPane';
import { useStreamingLogs } from '@/hooks/useStreamingLogs';

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
  isLatestTask: boolean;
  isActive: boolean;
}

/**
 * TaskMessage component - renders a single task with its logs
 * Uses the streaming logs hook for each task individually
 */
function TaskMessage({ task, isLatestTask, isActive }: TaskMessageProps) {
  const [showStdoutCopyFeedback, setShowStdoutCopyFeedback] = useState(false);
  const [showStderrCopyFeedback, setShowStderrCopyFeedback] = useState(false);

  // Only stream for running tasks or the latest task, and only when tab is active
  const shouldStream = isActive && (task.status === 'running' || isLatestTask);
  const { stdout, stderr, isLoading, isStreaming, sseConnected } = useStreamingLogs(
    task.id,
    shouldStream,
    task.status
  );

  const streamingState = {
    isLoading,
    isStreaming,
    sseConnected,
  };

  const logs = {
    stdout,
    stderr,
  };

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
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

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

  // Create task mutation (for personal projects - user ↔ agent)
  const createTaskMutation = useMutation({
    mutationFn: async () => {
      // Start a task with the user's message
      const response = await workItemsApi.startTask(workItemId, newMessage);
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
          {[...tasks].reverse().map((task, index) => {
            // After reversing, the first item (index 0) is the latest
            const isLatestTask = index === 0;
            return (
              <TaskMessage
                key={task.id}
                task={task}
                isLatestTask={isLatestTask}
                isActive={isActive}
              />
            );
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
