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
 */

import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Clock, Terminal, User, Bot } from 'lucide-react';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/Toast';
import { workItemsApi, agentRunsApi } from '@/lib/api';
import { useWorkItem } from '@/hooks/useWorkItem';

export interface ConversationTabProps {
  prId: string;
  workItemId: string;
}

/**
 * ConversationTab component
 *
 * @param prId - The ID of PR to display comments for
 * @param workItemId - The ID of WorkItem associated with this PR
 */
export function ConversationTab({ prId, workItemId }: ConversationTabProps) {
  const [newMessage, setNewMessage] = useState('');
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [streamingLogs, setStreamingLogs] = useState<{ stdout: string; stderr: string }>({
    stdout: '',
    stderr: '',
  });
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const logEndRef = useRef<HTMLDivElement>(null);

  // Fetch workItem to get project info
  const { data: workItem } = useWorkItem(workItemId);

  // Fetch tasks for this work item
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
    enabled: !!workItemId,
  });

  // Poll for logs when there's an active running task
  const { data: taskLogs } = useQuery({
    queryKey: ['task-logs', activeTaskId],
    queryFn: async () => {
      if (!activeTaskId) return { stdout: '', stderr: '' };
      try {
        const logs = await agentRunsApi.getLogs(activeTaskId);
        return logs;
      } catch {
        return { stdout: '', stderr: '' };
      }
    },
    enabled: !!activeTaskId,
    refetchInterval: (data) => {
      // Stop polling if task is finished
      const task = tasks?.find((t) => t.id === activeTaskId);
      if (
        task &&
        (task.status === 'succeeded' || task.status === 'failed' || task.status === 'cancelled')
      ) {
        return false;
      }
      return 2000; // Poll every 2 seconds
    },
  });

  // Update streaming logs when task logs change
  useEffect(() => {
    if (taskLogs) {
      setStreamingLogs(taskLogs);
    }
  }, [taskLogs]);

  // Scroll to bottom when logs update
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [streamingLogs]);

  // Create task mutation (for personal projects - user ↔ agent)
  const createTaskMutation = useMutation({
    mutationFn: async (message: string) => {
      // Create a task with the user's message
      const response = await workItemsApi.startAgentRun(workItemId, {
        inputSummary: message,
        inputJson: JSON.stringify({ prompt: message }),
      });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['workitem-tasks', workItemId] });
      setActiveTaskId(data.id);
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
    await createTaskMutation.mutateAsync(newMessage);
  };

  // Get the latest task for displaying in conversation
  const latestTask = tasks && tasks.length > 0 ? tasks[tasks.length - 1] : null;

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
          {tasks.map((task) => (
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
                        <span>{new Date(task.createdAt).toLocaleString()}</span>
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
                            <span>{new Date(task.finishedAt).toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Streaming Logs Panel */}
                  {(activeTaskId === task.id || task.status === 'running') && (
                    <div className="max-h-96 overflow-y-auto p-4">
                      <div className="mb-2 flex items-center space-x-2">
                        <Terminal className="h-4 w-4 text-gray-500" />
                        <span className="text-xs font-medium text-gray-700">Agent Output</span>
                      </div>
                      {streamingLogs.stdout && (
                        <div className="mb-2">
                          <div className="mb-1 text-xs font-medium text-gray-600">STDOUT:</div>
                          <pre className="rounded bg-gray-900 p-2 text-xs text-green-400">
                            {streamingLogs.stdout}
                          </pre>
                        </div>
                      )}
                      {streamingLogs.stderr && (
                        <div>
                          <div className="mb-1 text-xs font-medium text-gray-600">STDERR:</div>
                          <pre className="rounded bg-gray-900 p-2 text-xs text-red-400">
                            {streamingLogs.stderr}
                          </pre>
                        </div>
                      )}
                      <div ref={logEndRef} />
                    </div>
                  )}
                  {task.status !== 'running' && activeTaskId !== task.id && (
                    <div className="p-4 text-sm text-gray-600">
                      Task completed. View full logs in the Logs tab.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
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
