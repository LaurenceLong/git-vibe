/**
 * WorktreeStatus Component
 *
 * Display worktree status with actions
 * Shows worktree path, branch name, and status-specific actions
 */

import { WorktreeStatus } from '@/types';
import { WorktreeStatusBadge } from './WorktreeStatusBadge';
import { Button } from '@/components/ui/Button';
import { useConfirmModal } from '@/components/ConfirmModal';
import { AlertCircle, RefreshCw, Trash2, GitBranch, Calendar } from 'lucide-react';
import { formatDateTime } from '@/lib/datetime';

export interface WorktreeStatusProps {
  /** The worktree status */
  status: WorktreeStatus;
  /** The worktree path (null if missing) */
  path: string | null;
  /** The branch name */
  branchName: string;
  /** The project ID */
  projectId: string;
  /** Optional created date */
  createdAt?: Date;
  /** Optional updated date */
  updatedAt?: Date;
  /** Callback to recreate worktree */
  onRecreate?: () => void;
  /** Callback to remove worktree */
  onRemove?: () => void;
  /** Whether recreate operation is in progress */
  isRecreating?: boolean;
  /** Whether remove operation is in progress */
  isRemoving?: boolean;
  /** Error message to display */
  error?: string | null;
}

/**
 * WorktreeStatus component
 * Displays worktree status with appropriate actions
 *
 * @param status - The worktree status
 * @param path - The worktree path
 * @param branchName - The branch name
 * @param projectId - The project ID
 * @param createdAt - Optional created date
 * @param updatedAt - Optional updated date
 * @param onRecreate - Callback to recreate worktree
 * @param onRemove - Callback to remove worktree
 * @param isRecreating - Whether recreate operation is in progress
 * @param isRemoving - Whether remove operation is in progress
 * @param error - Error message to display
 */
export function WorktreeStatusComponent({
  status,
  path,
  branchName,
  projectId: _projectId,
  createdAt,
  updatedAt,
  onRecreate,
  onRemove,
  isRecreating = false,
  isRemoving = false,
  error = null,
}: WorktreeStatusProps) {
  const { confirm } = useConfirmModal();

  const handleRecreate = async () => {
    if (await confirm({ message: 'Are you sure you want to recreate this worktree?' })) {
      onRecreate?.();
    }
  };

  const handleRemove = async () => {
    if (
      await confirm({
        message:
          'Are you sure you want to remove this worktree? This will delete the worktree directory.',
        variant: 'danger',
        confirmLabel: 'Remove',
      })
    ) {
      onRemove?.();
    }
  };

  return (
    <div className="space-y-4">
      {/* Status Banner */}
      <div
        className={`rounded-lg border p-4 ${
          status === 'present'
            ? 'border-green-200 bg-green-50'
            : status === 'missing'
              ? 'border-red-200 bg-red-50'
              : 'border-yellow-200 bg-yellow-50'
        }`}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="mb-2 flex items-center space-x-2">
              <WorktreeStatusBadge status={status} />
              {status === 'recreating' && (
                <div className="inline-flex items-center space-x-1 text-sm text-yellow-700">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Recreating worktree...</span>
                </div>
              )}
            </div>

            {/* Worktree Path */}
            {path && (
              <div className="mb-2 flex items-center space-x-2 text-sm text-gray-700">
                <GitBranch className="h-4 w-4" />
                <span>
                  <span className="font-medium">Branch:</span> {branchName}
                </span>
                <span className="text-gray-400">|</span>
                <span>
                  <span className="font-medium">Path:</span>{' '}
                  <code className="rounded bg-white px-1 py-0.5 text-xs">{path}</code>
                </span>
              </div>
            )}

            {/* Metadata */}
            <div className="flex flex-wrap gap-4 text-sm text-gray-600">
              {createdAt && (
                <div className="flex items-center space-x-1">
                  <Calendar className="h-3 w-3" />
                  <span>
                    <span className="font-medium">Created:</span> {formatDateTime(createdAt)}
                  </span>
                </div>
              )}
              {updatedAt && (
                <div className="flex items-center space-x-1">
                  <Calendar className="h-3 w-3" />
                  <span>
                    <span className="font-medium">Updated:</span> {formatDateTime(updatedAt)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2">
            {status === 'present' && onRemove && (
              <Button
                variant="danger"
                size="sm"
                onClick={handleRemove}
                loading={isRemoving}
                disabled={isRecreating || isRemoving}
              >
                <Trash2 className="mr-1 h-4 w-4" />
                Remove Worktree
              </Button>
            )}
            {status === 'missing' && onRecreate && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleRecreate}
                loading={isRecreating}
                disabled={isRecreating}
              >
                <RefreshCw className="mr-1 h-4 w-4" />
                Recreate Worktree
              </Button>
            )}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mt-3 flex items-start space-x-2 rounded-md border border-red-300 bg-red-100 p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Status Description */}
        {status === 'missing' && !error && (
          <div className="mt-3 rounded-md bg-white p-3 text-sm text-gray-700">
            <p>
              The worktree for this branch is not available. You can recreate it to continue working
              on this branch.
            </p>
          </div>
        )}

        {status === 'present' && !error && (
          <div className="mt-3 rounded-md bg-white p-3 text-sm text-gray-700">
            <p>The worktree is available and ready for use.</p>
          </div>
        )}

        {status === 'recreating' && !error && (
          <div className="mt-3 rounded-md bg-white p-3 text-sm text-gray-700">
            <p>The worktree is being recreated. This may take a few moments...</p>
          </div>
        )}
      </div>
    </div>
  );
}
