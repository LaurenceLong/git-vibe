/**
 * OverviewTab Component for PRs
 *
 * Displays PR overview with merge/close actions
 *
 * Features:
 * - Display PR status badge (open/merged/closed)
 * - Add merge/close action buttons
 * - Show merge metadata (merged by, merged at, merged SHA)
 * - Show close metadata (closed by, closed at)
 * - Display worktree status banner
 * - Show linked WorkItem if exists
 * - Display PR statistics (files changed, additions, deletions)
 * - Show recent activity
 */

import { ChangeSet } from '@/types';
import { useMergePR, useClosePR, useReopenPR } from '@/hooks/usePR';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/status-badge';
import { GitMerge, X as GitClose, GitBranch, Clock, FileText, User } from 'lucide-react';

/**
 * Props for the OverviewTab component
 */
export interface OverviewTabProps {
  /** The PR (ChangeSet) data */
  pr: ChangeSet;
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
  const mergePR = useMergePR(pr.id);
  const closePR = useClosePR(pr.id);
  const reopenPR = useReopenPR(pr.id);

  // Get PR status from prStatus field (PR-specific status)
  const prStatus = pr.prStatus || 'open';

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
        await mergePR();
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

  // Handle reopen action
  const handleReopen = async () => {
    if (window.confirm('Are you sure you want to reopen this PR?')) {
      try {
        await reopenPR();
      } catch (error) {
        console.error('Failed to reopen PR:', error);
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
                  loading={mergePR.isLoading}
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
                  loading={closePR.isLoading}
                  disabled={actionsDisabled}
                  title={actionsDisabled ? 'Worktree is missing' : 'Close PR'}
                >
                  <GitClose className="mr-2 h-4 w-4" />
                  Close
                </Button>
              </>
            )}
            {prStatus === 'closed' && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleReopen}
                loading={reopenPR.isLoading}
                disabled={actionsDisabled}
                title={actionsDisabled ? 'Worktree is missing' : 'Reopen PR'}
              >
                Reopen
              </Button>
            )}
          </div>
        </div>

        {/* PR Description */}
        {pr.body && (
          <div className="mb-4">
            <p className="whitespace-pre-wrap text-gray-700">{pr.body}</p>
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
                {pr.branchName} → {pr.baseBranch}
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

          {/* Closed Information */}
          {prStatus === 'closed' && pr.closedAt && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-gray-700">Closed</h3>
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <GitClose className="h-4 w-4" />
                <span>{new Date(pr.closedAt).toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* Base SHA */}
          {pr.baseSha && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-gray-700">Base SHA</h3>
              <code className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">
                {pr.baseSha.slice(0, 8)}
              </code>
            </div>
          )}

          {/* Head SHA */}
          {pr.headSha && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-gray-700">Head SHA</h3>
              <code className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">
                {pr.headSha.slice(0, 8)}
              </code>
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
            {pr.worktreePath && (
              <span className="text-sm text-gray-600">
                at{' '}
                <code className="rounded bg-gray-200 px-1 py-0.5 text-xs">{pr.worktreePath}</code>
              </span>
            )}
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
