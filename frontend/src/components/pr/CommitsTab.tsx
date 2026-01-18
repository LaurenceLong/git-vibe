/**
 * CommitsTab Component
 *
 * Displays PR commits grouped by task
 *
 * Features:
 * - List commits grouped by task
 * - Show files changed per commit/task
 * - Display commit details (SHA, message, author, date)
 */

import { useQuery } from '@tanstack/react-query';
import { pullRequestsApi } from '@/lib/api';
import { useWorkItem } from '@/hooks/useWorkItem';
import { GitCommit, FileText, Hash, User, Clock, ListTodo } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import type { AgentRun } from '@/types';
import { formatDateTime } from '@/lib/datetime';

export interface CommitsTabProps {
  prId: string;
  workItemId: string;
}

/**
 * CommitsTab component
 *
 * @param prId - The ID of PR to display commits for
 * @param workItemId - The ID of WorkItem associated with this PR
 */
export function CommitsTab({ prId, workItemId }: CommitsTabProps) {
  // Fetch commits with task grouping
  const {
    data: commitsWithTasks,
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: ['pr-commits-with-tasks', prId],
    queryFn: async () => {
      const response = await pullRequestsApi.getCommitsWithTasks(prId);
      return response.data;
    },
  });

  // Get workItem for navigation
  const { data: workItem } = useWorkItem(workItemId);

  // Loading state
  if (isLoading) {
    return (
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="py-12 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
          <p className="mt-2 text-sm text-gray-600">Loading commits...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (queryError) {
    return (
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="text-center text-red-600">
          <p className="font-medium">Error loading commits</p>
          <p className="mt-1 text-sm">{queryError.message || 'Unknown error'}</p>
        </div>
      </div>
    );
  }

  // No commits or invalid data
  // Check if we have any groups with commits
  const hasCommits =
    Array.isArray(commitsWithTasks) &&
    commitsWithTasks.length > 0 &&
    commitsWithTasks.some((group) => group.commits && group.commits.length > 0);

  if (!hasCommits) {
    return (
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <EmptyState
          icon={GitCommit}
          title="No commits yet"
          description="Commits will appear here once tasks are executed and changes are committed"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Commits</h2>
      </div>

      {/* Commits grouped by task */}
      <div className="space-y-6">
        {commitsWithTasks.map((group, groupIndex) => (
          <div key={groupIndex} className="rounded-lg border bg-white p-6 shadow-sm">
            {/* Task Header */}
            {group.task ? (
              <div className="mb-4 flex items-center justify-between border-b border-gray-200 pb-3">
                <div className="flex items-center space-x-2">
                  <ListTodo className="h-5 w-5 text-blue-600" />
                  <span className="text-lg font-semibold text-gray-900">
                    {(group.task as AgentRun).inputSummary ||
                      `Task ${(group.task as AgentRun).id.slice(0, 8)}`}
                  </span>
                </div>
                <div className="flex items-center space-x-2 text-sm text-gray-500">
                  <span className="rounded-md bg-gray-100 px-2 py-1">
                    {(group.task as AgentRun).status}
                  </span>
                </div>
              </div>
            ) : (
              <div className="mb-4 flex items-center space-x-2 border-b border-gray-200 pb-3">
                <GitCommit className="h-5 w-5 text-gray-500" />
                <h3 className="text-lg font-semibold text-gray-700">Other Commits</h3>
              </div>
            )}

            {/* Commits List */}
            <div className="space-y-4">
              {group.commits.map((commit) => (
                <div key={commit.sha} className="rounded-md border border-gray-200 bg-gray-50 p-4">
                  <div className="mb-2 flex items-start justify-between">
                    <div className="flex-1">
                      <div className="mb-1 flex items-center space-x-2">
                        <Hash className="h-4 w-4 text-gray-500" />
                        <code className="rounded bg-white px-2 py-0.5 font-mono text-xs text-gray-700">
                          {commit.sha.slice(0, 8)}
                        </code>
                      </div>
                      <p className="text-sm font-medium text-gray-900">{commit.message}</p>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-gray-600">
                    <div className="flex items-center space-x-1">
                      <User className="h-3 w-3" />
                      <span>{commit.author}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Clock className="h-3 w-3" />
                      <span>{formatDateTime(commit.date)}</span>
                    </div>
                  </div>

                  {/* Files Changed */}
                  {commit.filesChanged.length > 0 && (
                    <div className="mt-3 border-t border-gray-200 pt-3">
                      <div className="mb-2 flex items-center space-x-2">
                        <FileText className="h-4 w-4 text-gray-500" />
                        <span className="text-xs font-medium text-gray-700">
                          Files Changed ({commit.filesChanged.length})
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {commit.filesChanged.map((file, idx) => (
                          <span
                            key={idx}
                            className="rounded-md bg-white px-2 py-1 font-mono text-xs text-gray-700"
                          >
                            {file}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
