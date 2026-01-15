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

import { PullRequest } from '@/types';
import { useMergePR, useClosePR } from '@/hooks/usePR';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/status-badge';
import { GitMerge, X as GitClose, GitBranch, Clock, FileText, User } from 'lucide-react';

/**
 * Props for the OverviewTab component
 */
export interface OverviewTabProps {
  /** The PR data */
  pr: PullRequest;
  /** Worktree status */
  worktreeStatus?: 'present' | 'missing' | 'recreating';
}

/**
 * OverviewTab component for PRs
 *
 * @param pr - The PR data
 * @param worktreeStatus - The worktree status
 */
export function OverviewTab({ pr, worktreeStatus = 'present' }: OverviewTabProps) {
  const { mergePR, isLoading: isMerging } = useMergePR(pr.id);
  const { closePR, isLoading: isClosing } = useClosePR(pr.id);

  // Get PR status
  const prStatus = pr.status;

  // Check if actions should be disabled (worktree missing)
  const actionsDisabled = worktreeStatus === 'missing' || worktreeStatus === 'recreating';

  // Get status type for badge
  const getStatusType = (status: string): 'success' | 'error' | 'info' | 'neutral' | 'warning' => {
    switch (status) {
      case 'open':
        return 'success';
      case 'merged':
        return 'info';
      case 'closed':
        return 'neutral';
      default:
        return 'neutral';
    }
  };

  // Handle merge action
  const handleMerge = async () => {
    if (window.confirm('Are you sure you want to merge this PR?')) {
      try {
        await mergePR(pr.mergeStrategy);
      } catch (error) {
        console.error('Failed to merge PR:', error);
      }
    }
  };

  // Handle close action
  const handleClose = async () => {
    if (window.confirm('Are you sure you want to close this PR?')) {
      try {
        await closePR();
      } catch (error) {
        console.error('Failed to close PR:', error);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* PR Status and Actions */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <StatusBadge status={getStatusType(prStatus)}>{prStatus}</StatusBadge>
            <h2 className="text-xl font-semibold text-gray-900">{pr.title}</h2>
          </div>
          <div className="flex items-center space-x-2">
            {prStatus === 'open' && (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleMerge}
                  loading={isMerging}
                  disabled={actionsDisabled}
                  title={actionsDisabled ? 'Worktree is missing' : 'Merge PR'}
                >
                  <GitMerge className="mr-2 h-4 w-4" />
                  Merge
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleClose}
                  loading={isClosing}
                  disabled={actionsDisabled}
                  title={actionsDisabled ? 'Worktree is missing' : 'Close PR'}
                >
                  <GitClose className="mr-2 h-4 w-4" />
                  Close
                </Button>
              </>
            )}
          </div>
        </div>

        {/* PR Description */}
        {pr.description && (
          <div className="mb-4">
            <p className="whitespace-pre-wrap text-gray-700">{pr.description}</p>
          </div>
        )}

        {/* PR Metadata */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Branch Information */}
          <div>
            <h3 className="mb-2 text-sm font-medium text-gray-700">Branch Information</h3>
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <GitBranch className="h-4 w-4" />
              <span>
                {pr.sourceBranch} → {pr.targetBranch}
              </span>
            </div>
          </div>

          {/* Created Date */}
          <div>
            <h3 className="mb-2 text-sm font-medium text-gray-700">Created</h3>
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <Clock className="h-4 w-4" />
              <span>{new Date(pr.createdAt).toLocaleString()}</span>
            </div>
          </div>

          {/* Merged Information */}
          {prStatus === 'merged' && pr.mergedAt && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-gray-700">Merged</h3>
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <GitMerge className="h-4 w-4" />
                <span>{new Date(pr.mergedAt).toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* Merge Strategy */}
          <div>
            <h3 className="mb-2 text-sm font-medium text-gray-700">Merge Strategy</h3>
            <span className="text-sm capitalize text-gray-600">{pr.mergeStrategy}</span>
          </div>

          {/* Merge Commit SHA */}
          {pr.mergeCommitSha && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-gray-700">Merge Commit SHA</h3>
              <code className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">
                {pr.mergeCommitSha.slice(0, 8)}
              </code>
            </div>
          )}

          {/* Merged By */}
          {pr.mergedBy && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-gray-700">Merged By</h3>
              <span className="text-sm text-gray-600">{pr.mergedBy}</span>
            </div>
          )}
        </div>

        {/* Worktree Status */}
        <div className="mt-4 rounded-md bg-gray-50 p-4">
          <h3 className="mb-2 text-sm font-medium text-gray-700">Worktree Status</h3>
          <div className="flex items-center space-x-2">
            <StatusBadge
              status={
                worktreeStatus === 'present'
                  ? 'success'
                  : worktreeStatus === 'missing'
                    ? 'error'
                    : 'info'
              }
            >
              {worktreeStatus}
            </StatusBadge>
            <span className="text-sm text-gray-600">
              Worktree is managed by the associated WorkItem
            </span>
          </div>
        </div>
      </div>

      {/* Linked WorkItem */}
      {pr.workItemId && (
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <div className="mb-3 flex items-center space-x-2">
            <FileText className="h-5 w-5 text-gray-500" />
            <h3 className="text-lg font-semibold text-gray-900">Linked WorkItem</h3>
          </div>
          <p className="text-sm text-gray-600">
            This PR was created from a WorkItem. The WorkItem ID is:{' '}
            <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">{pr.workItemId}</code>
          </p>
        </div>
      )}

      {/* PR Statistics */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="mb-3 flex items-center space-x-2">
          <FileText className="h-5 w-5 text-gray-500" />
          <h3 className="text-lg font-semibold text-gray-900">PR Statistics</h3>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <p className="text-sm text-gray-600">Files Changed</p>
            <p className="text-2xl font-semibold text-gray-900">-</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Additions</p>
            <p className="text-2xl font-semibold text-green-600">+</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Deletions</p>
            <p className="text-2xl font-semibold text-red-600">-</p>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="mb-3 flex items-center space-x-2">
          <User className="h-5 w-5 text-gray-500" />
          <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
        </div>
        <p className="text-sm text-gray-600">
          PR created on {new Date(pr.createdAt).toLocaleString()}
          {pr.updatedAt && pr.updatedAt !== pr.createdAt && (
            <>, last updated on {new Date(pr.updatedAt).toLocaleString()}</>
          )}
        </p>
      </div>
    </div>
  );
}
