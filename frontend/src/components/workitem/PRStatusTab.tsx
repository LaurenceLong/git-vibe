/**
 * PRStatusTab Component
 *
 * Displays PR status for this WorkItem
 *
 * Features:
 * - Display PR status for this WorkItem
 * - Show if PR exists (linked PullRequest)
 * - If PR exists: show PR link, status, merge status
 * - If PR doesn't exist: show message that PRs are auto-created after agent runs
 * - Display PR details (base branch, head branch, SHAs)
 * - Show PR actions (merge, close) if applicable
 * - Navigate to PR detail page via "View Full Details" link
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { workItemsApi, pullRequestsApi, projectsApi } from '@/lib/api';
import { PullRequest } from '@/types';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { GitPullRequest, GitBranch, Hash, CheckCircle, XCircle, ExternalLink } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { useWorkItem } from '@/hooks/useWorkItem';
import { formatDateTime } from '@/lib/datetime';

export interface PRStatusTabProps {
  workItemId: string;
}

/**
 * PRStatusTab component
 *
 * @param workItemId - The ID of WorkItem to display PR status for
 */
export function PRStatusTab({ workItemId }: PRStatusTabProps) {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  // Fetch workItem to get projectId
  const { data: workItem } = useWorkItem(workItemId);

  // Fetch project to get project name for navigation
  const { data: project } = useQuery({
    queryKey: ['project', workItem?.projectId],
    queryFn: async () => {
      if (!workItem?.projectId) return null;
      const response = await projectsApi.get(workItem.projectId);
      return response.data;
    },
    enabled: !!workItem?.projectId,
  });

  // Fetch all PRs for this WorkItem
  const { data: prs, isLoading } = useQuery({
    queryKey: ['workitem-prs', workItemId],
    queryFn: async () => {
      // Get PRs for this WorkItem
      const response = await workItemsApi.getPRs(workItemId);
      return (response.data || []) as PullRequest[];
    },
  });

  // Merge PR mutation
  const mergePRMutation = useMutation({
    mutationFn: async (prId: string) => {
      const response = await pullRequestsApi.merge(prId);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workitem-prs', workItemId] });
      queryClient.invalidateQueries({ queryKey: ['workitem', workItemId] });
      queryClient.invalidateQueries({ queryKey: ['pull-requests'] });
      success('PR merged successfully');
    },
    onError: (err: Error) => {
      showError(`Failed to merge PR: ${err.message}`);
    },
  });

  // Close PR mutation
  const closePRMutation = useMutation({
    mutationFn: async (prId: string) => {
      const response = await pullRequestsApi.close(prId);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workitem-prs', workItemId] });
      queryClient.invalidateQueries({ queryKey: ['workitem', workItemId] });
      queryClient.invalidateQueries({ queryKey: ['pull-requests'] });
      success('PR closed successfully');
    },
    onError: (err: Error) => {
      showError(`Failed to close PR: ${err.message}`);
    },
  });

  const handleMergePR = async (prId: string) => {
    if (window.confirm('Are you sure you want to merge this PR?')) {
      await mergePRMutation.mutateAsync(prId);
    }
  };

  const handleClosePR = async (prId: string) => {
    if (window.confirm('Are you sure you want to close this PR?')) {
      await closePRMutation.mutateAsync(prId);
    }
  };

  // Get PR status type for badge
  const getPRStatusType = (
    status: string
  ): 'success' | 'error' | 'info' | 'neutral' | 'warning' => {
    switch (status) {
      case 'open':
        return 'info';
      case 'merged':
        return 'success';
      case 'closed':
        return 'neutral';
      default:
        return 'neutral';
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="py-12 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
          <p className="mt-2 text-sm text-gray-600">Loading PR status...</p>
        </div>
      </div>
    );
  }

  // No PRs exist
  if (!prs || prs.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <EmptyState
          icon={GitPullRequest}
          title="No PR created yet"
          description="Pull Requests are automatically created after each agent run completes successfully"
        />
      </div>
    );
  }

  // PRs exist - show all of them
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Pull Requests ({prs.length})</h2>
      </div>

      {/* PRs List */}
      <div className="space-y-4">
        {prs.map((pr) => (
          <div key={pr.id} className="rounded-lg border bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-start justify-between">
              <div className="flex-1">
                <div className="mb-2 flex items-center space-x-2">
                  <StatusBadge status={getPRStatusType(pr.status)}>{pr.status}</StatusBadge>
                  <span className="rounded-md bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
                    Pull Request #{pr.id.slice(0, 8)}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-gray-900">{pr.title}</h3>
                {pr.description && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">{pr.description}</p>
                )}
              </div>
              <div className="flex items-center space-x-2">
                {pr.status === 'open' && (
                  <>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleMergePR(pr.id)}
                      loading={mergePRMutation.isPending}
                    >
                      Merge
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleClosePR(pr.id)}
                      loading={closePRMutation.isPending}
                    >
                      Close
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* PR Details */}
            <div className="grid grid-cols-1 gap-3 border-t border-gray-200 pt-4 sm:grid-cols-2">
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <GitBranch className="h-4 w-4" />
                <span>
                  <span className="font-medium">Base Branch:</span> {pr.targetBranch}
                </span>
              </div>
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <GitBranch className="h-4 w-4" />
                <span>
                  <span className="font-medium">Head Branch:</span> {pr.sourceBranch}
                </span>
              </div>
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <Hash className="h-4 w-4" />
                <span>
                  <span className="font-medium">Merge Strategy:</span>{' '}
                  <span className="capitalize">{pr.mergeStrategy}</span>
                </span>
              </div>
              {pr.mergeCommitSha && (
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <Hash className="h-4 w-4" />
                  <span>
                    <span className="font-medium">Merge Commit:</span>{' '}
                    <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">
                      {pr.mergeCommitSha.slice(0, 8)}
                    </code>
                  </span>
                </div>
              )}
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <span>
                  <span className="font-medium">Created:</span> {formatDateTime(pr.createdAt)}
                </span>
              </div>
              {pr.mergedAt && (
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <span>
                    <span className="font-medium">Merged:</span> {formatDateTime(pr.mergedAt)}
                  </span>
                </div>
              )}
            </div>

            {/* PR Status and Actions */}
            <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-4">
              <div className="flex items-center space-x-4">
                {pr.status === 'merged' && (
                  <div className="flex items-center space-x-2 text-sm text-green-700">
                    <CheckCircle className="h-4 w-4" />
                    <span>Merged successfully</span>
                  </div>
                )}
                {pr.status === 'closed' && (
                  <div className="flex items-center space-x-2 text-sm text-gray-600">
                    <XCircle className="h-4 w-4" />
                    <span>Closed</span>
                  </div>
                )}
                {pr.status === 'open' && (
                  <div className="flex items-center space-x-2 text-sm text-blue-700">
                    <GitPullRequest className="h-4 w-4" />
                    <span>Open for review</span>
                  </div>
                )}
              </div>
              {project && (
                <Link
                  to="/projects/$projectName/pullrequests"
                  params={{ projectName: project.name }}
                  search={{ status: 'all', prId: pr.id }}
                  className="flex items-center space-x-1 text-sm text-blue-600 transition-colors hover:text-blue-800"
                >
                  <span>View Full Details</span>
                  <ExternalLink className="h-4 w-4" />
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
