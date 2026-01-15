/**
 * PRStatusTab Component
 *
 * Displays PR status for this WorkItem
 *
 * Features:
 * - Display PR status for this WorkItem
 * - Show if PR exists (linked ChangeSet)
 * - If PR exists: show PR link, status, merge status
 * - If PR doesn't exist: show "Create PR" button
 * - Display PR details (base branch, head branch, SHAs)
 * - Show PR actions (merge, close) if applicable
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { workItemsApi, changesetsApi } from '@/lib/api';
import { ChangeSet } from '@/types';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { GitPullRequest, GitBranch, Hash, CheckCircle, XCircle } from 'lucide-react';
import { useToast } from '@/components/Toast';

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

  // Fetch linked PR for this WorkItem
  const { data: linkedPR, isLoading } = useQuery({
    queryKey: ['workitem-pr', workItemId],
    queryFn: async () => {
      // Placeholder: Return null for now
      // TODO: Implement actual API call when backend is ready
      return null as ChangeSet | null;
    },
  });

  // Create PR mutation
  const createPRMutation = useMutation({
    mutationFn: async () => {
      const response = await workItemsApi.createPR(workItemId);
      return response.data as ChangeSet;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workitem-pr', workItemId] });
      queryClient.invalidateQueries({ queryKey: ['workitem', workItemId] });
      queryClient.invalidateQueries({ queryKey: ['changesets'] });
      success('PR created successfully');
    },
    onError: (err: Error) => {
      showError(`Failed to create PR: ${err.message}`);
    },
  });

  // Merge PR mutation
  const mergePRMutation = useMutation({
    mutationFn: async (prId: string) => {
      const response = await changesetsApi.merge(prId);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workitem-pr', workItemId] });
      queryClient.invalidateQueries({ queryKey: ['workitem', workItemId] });
      success('PR merged successfully');
    },
    onError: (err: Error) => {
      showError(`Failed to merge PR: ${err.message}`);
    },
  });

  // Close PR mutation
  const closePRMutation = useMutation({
    mutationFn: async (prId: string) => {
      const response = await changesetsApi.close(prId);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workitem-pr', workItemId] });
      queryClient.invalidateQueries({ queryKey: ['workitem', workItemId] });
      success('PR closed successfully');
    },
    onError: (err: Error) => {
      showError(`Failed to close PR: ${err.message}`);
    },
  });

  const handleCreatePR = async () => {
    if (window.confirm('Are you sure you want to create a PR from this WorkItem?')) {
      await createPRMutation.mutateAsync();
    }
  };

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

  // No PR exists
  if (!linkedPR) {
    return (
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <EmptyState
          icon={GitPullRequest}
          title="No PR created yet"
          description="Create a Pull Request from this WorkItem to start the review process"
          action={
            <Button variant="primary" onClick={handleCreatePR} loading={createPRMutation.isPending}>
              Create PR
            </Button>
          }
        />
      </div>
    );
  }

  // PR exists
  return (
    <div className="space-y-6">
      {/* PR Header */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex-1">
            <div className="mb-2 flex items-center space-x-2">
              <StatusBadge status={getPRStatusType(linkedPR.status)}>{linkedPR.status}</StatusBadge>
              <span className="rounded-md bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
                Pull Request
              </span>
            </div>
            <h2 className="text-xl font-semibold text-gray-900">{linkedPR.title}</h2>
            {linkedPR.body && (
              <p className="mt-2 whitespace-pre-wrap text-gray-600">{linkedPR.body}</p>
            )}
          </div>
          <div className="flex items-center space-x-2">
            {linkedPR.prStatus === 'open' && (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleMergePR(linkedPR.id)}
                  loading={mergePRMutation.isPending}
                >
                  Merge
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleClosePR(linkedPR.id)}
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
              <span className="font-medium">Base Branch:</span> {linkedPR.baseBranch}
            </span>
          </div>
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <GitBranch className="h-4 w-4" />
            <span>
              <span className="font-medium">Head Branch:</span> {linkedPR.branchName}
            </span>
          </div>
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <Hash className="h-4 w-4" />
            <span>
              <span className="font-medium">Base SHA:</span>{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">
                {linkedPR.baseSha.slice(0, 8)}
              </code>
            </span>
          </div>
          {linkedPR.headSha && (
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <Hash className="h-4 w-4" />
              <span>
                <span className="font-medium">Head SHA:</span>{' '}
                <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">
                  {linkedPR.headSha.slice(0, 8)}
                </code>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* PR Status Actions */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">PR Status</h3>
        <div className="space-y-4">
          {linkedPR.prStatus === 'merged' && (
            <div className="flex items-start space-x-3 rounded-md border border-green-200 bg-green-50 p-4">
              <CheckCircle className="mt-0.5 h-5 w-5 text-green-600" />
              <div>
                <h4 className="font-medium text-green-900">PR Merged</h4>
                <p className="mt-1 text-sm text-green-700">
                  This PR has been successfully merged into the base branch
                </p>
              </div>
            </div>
          )}
          {linkedPR.prStatus === 'closed' && (
            <div className="flex items-start space-x-3 rounded-md border border-gray-200 bg-gray-50 p-4">
              <XCircle className="mt-0.5 h-5 w-5 text-gray-600" />
              <div>
                <h4 className="font-medium text-gray-900">PR Closed</h4>
                <p className="mt-1 text-sm text-gray-700">
                  This PR has been closed without merging
                </p>
              </div>
            </div>
          )}
          {linkedPR.prStatus === 'open' && (
            <div className="flex items-start space-x-3 rounded-md border border-blue-200 bg-blue-50 p-4">
              <GitPullRequest className="mt-0.5 h-5 w-5 text-blue-600" />
              <div>
                <h4 className="font-medium text-blue-900">PR Open</h4>
                <p className="mt-1 text-sm text-blue-700">
                  This PR is currently open and ready for review
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Link to PR Detail */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-gray-900">View Full PR Details</h3>
            <p className="mt-1 text-sm text-gray-600">
              See the complete PR with diff, reviews, and more
            </p>
          </div>
          <div>
            <Button variant="secondary" size="sm" disabled>
              Open PR
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
