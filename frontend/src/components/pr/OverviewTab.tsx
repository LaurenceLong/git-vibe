/**
 * OverviewTab Component for PRs
 *
 * Displays PR overview with merge/close actions
 *
 * Features:
 * - Display PR status badge (open/merged/closed)
 * - Add merge/close action buttons
 * - Show merge metadata (merged by, merged at, merged SHA)
 * - Display worktree status banner
 * - Show linked WorkItem if exists
 * - Display PR statistics (files changed, additions, deletions)
 * - Show recent activity
 */

import { useQuery } from '@tanstack/react-query';
import { PullRequest } from '@/types';
import { pullRequestsApi } from '@/lib/api';
import { FileText, User } from 'lucide-react';

/**
 * Props for the OverviewTab component
 */
export interface OverviewTabProps {
  /** The PR data */
  pr: PullRequest;
  /** Callback to navigate to a specific tab */
  onNavigateToTab?: (tab: string) => void;
}

/**
 * OverviewTab component for PRs
 *
 * @param pr - The PR data
 * @param onNavigateToTab - Callback to navigate to a specific tab
 */
export function OverviewTab({ pr, onNavigateToTab }: OverviewTabProps) {
  // Fetch PR statistics
  const { data: statistics } = useQuery({
    queryKey: ['pr-statistics', pr.id],
    queryFn: async () => {
      const response = await pullRequestsApi.getStatistics(pr.id);
      return response.data as { filesChanged: number; additions: number; deletions: number };
    },
  });

  // Fetch commits to get count
  const { data: commitsWithTasks } = useQuery({
    queryKey: ['pr-commits-with-tasks', pr.id],
    queryFn: async () => {
      try {
        const response = await pullRequestsApi.getCommitsWithTasks(pr.id);
        const data = response.data;
        // Ensure we always return an array
        return Array.isArray(data) ? data : [];
      } catch (error) {
        console.error('Failed to fetch commits with tasks:', error);
        return [];
      }
    },
  });

  // Calculate total commits count
  const commitsCount = Array.isArray(commitsWithTasks)
    ? commitsWithTasks.reduce(
        (total, group) => total + (Array.isArray(group.commits) ? group.commits.length : 0),
        0
      )
    : 0;

  return (
    <div className="space-y-6">
      {/* PR Statistics */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="mb-3 flex items-center space-x-2">
          <FileText className="h-5 w-5 text-gray-500" />
          <h3 className="text-lg font-semibold text-gray-900">PR Statistics</h3>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div>
            <p className="text-sm text-gray-600">Commits</p>
            {onNavigateToTab ? (
              <button
                onClick={() => onNavigateToTab('commits')}
                className="text-2xl font-semibold text-blue-600 hover:text-blue-800 hover:underline"
              >
                {commitsCount}
              </button>
            ) : (
              <p className="text-2xl font-semibold text-gray-900">{commitsCount}</p>
            )}
          </div>
          <div>
            <p className="text-sm text-gray-600">Files Changed</p>
            {onNavigateToTab ? (
              <button
                onClick={() => onNavigateToTab('files')}
                className="text-2xl font-semibold text-blue-600 hover:text-blue-800 hover:underline"
              >
                {statistics?.filesChanged ?? '-'}
              </button>
            ) : (
              <p className="text-2xl font-semibold text-gray-900">
                {statistics?.filesChanged ?? '-'}
              </p>
            )}
          </div>
          <div>
            <p className="text-sm text-gray-600">Additions</p>
            <p className="text-2xl font-semibold text-green-600">
              {statistics?.additions !== undefined ? `+${statistics.additions}` : '-'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Deletions</p>
            <p className="text-2xl font-semibold text-red-600">
              {statistics?.deletions !== undefined ? `-${statistics.deletions}` : '-'}
            </p>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="mb-3 flex items-center space-x-2">
          <User className="h-5 w-5 text-gray-500" />
          <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
        </div>
        <div className="space-y-3">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <div className="h-2 w-2 rounded-full bg-blue-600"></div>
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-900">PR created</p>
              <p className="text-xs text-gray-500">{new Date(pr.createdAt).toLocaleString()}</p>
            </div>
          </div>
          {pr.mergedAt && (
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                <div className="h-2 w-2 rounded-full bg-green-600"></div>
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-900">PR merged</p>
                <p className="text-xs text-gray-500">{new Date(pr.mergedAt).toLocaleString()}</p>
              </div>
            </div>
          )}
          {pr.status === 'closed' && !pr.mergedAt && (
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                <div className="h-2 w-2 rounded-full bg-gray-600"></div>
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-900">PR closed</p>
                {pr.updatedAt && pr.updatedAt !== pr.createdAt && (
                  <p className="text-xs text-gray-500">{new Date(pr.updatedAt).toLocaleString()}</p>
                )}
              </div>
            </div>
          )}
          {pr.updatedAt &&
            pr.updatedAt !== pr.createdAt &&
            !pr.mergedAt &&
            pr.status !== 'closed' && (
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                  <div className="h-2 w-2 rounded-full bg-gray-400"></div>
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-900">PR updated</p>
                  <p className="text-xs text-gray-500">{new Date(pr.updatedAt).toLocaleString()}</p>
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
