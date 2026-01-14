import { useState } from 'react';
import { ChangeSet } from '@/types';
import { useChangeSetRefresh } from '@/hooks/useChangeSetRefresh';
import { useWorktreeManagement } from '@/hooks/useWorktreeManagement';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { changesetsApi } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/status-badge';

/**
 * Props for the OverviewTab component
 */
export interface OverviewTabProps {
  changeset: ChangeSet;
}

/**
 * OverviewTab component
 * Displays changeset details and provides management actions
 *
 * Features:
 * - Display changeset details (title, body, status, branches, SHAs)
 * - Show worktree status
 * - Refresh head SHA
 * - Remove worktree
 * - Close changeset
 * - Delete changeset
 */
export function OverviewTab({ changeset }: OverviewTabProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  // Use custom hooks for changeset management
  const {
    refreshHead,
    isLoading: isRefreshing,
    error: refreshError,
  } = useChangeSetRefresh(changeset.id);
  const {
    removeWorktree,
    isLoading: isRemoving,
    error: removeError,
  } = useWorktreeManagement(changeset.id);

  // Close changeset mutation
  const closeMutation = useMutation({
    mutationFn: async () => {
      const response = await changesetsApi.close(changeset.id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['changeset', changeset.id] });
      success('Changeset closed successfully');
    },
    onError: (err: Error) => {
      showError(`Failed to close changeset: ${err.message}`);
    },
  });

  // Delete changeset mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await changesetsApi.delete(changeset.id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['changesets'] });
      success('Changeset deleted successfully');
      // Navigate back to changesets list would be handled by parent component
    },
    onError: (err: Error) => {
      showError(`Failed to delete changeset: ${err.message}`);
      setIsDeleting(false);
    },
  });

  const handleClose = async () => {
    await closeMutation.mutateAsync();
  };

  const handleDelete = async () => {
    if (
      window.confirm(
        'Are you sure you want to delete this changeset? This action cannot be undone.'
      )
    ) {
      setIsDeleting(true);
      await deleteMutation.mutateAsync();
    }
  };

  // Determine worktree status
  const worktreeStatus = changeset.worktreePath ? 'available' : 'missing';

  // Get status type for badge
  const getStatusType = (status: string): 'success' | 'error' | 'info' | 'neutral' | 'warning' => {
    switch (status) {
      case 'active':
        return 'info';
      case 'completed':
        return 'success';
      case 'cancelled':
        return 'error';
      case 'draft':
        return 'neutral';
      default:
        return 'neutral';
    }
  };

  // Get worktree status type
  const getWorktreeStatusType = (): 'success' | 'warning' => {
    return worktreeStatus === 'available' ? 'success' : 'warning';
  };

  return (
    <div className="space-y-6">
      {/* Changeset Details */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-gray-900">Overview</h2>
        <div className="space-y-4">
          {/* Title and Body */}
          <div>
            <h3 className="text-lg font-medium text-gray-900">{changeset.title}</h3>
            {changeset.body && (
              <p className="mt-2 whitespace-pre-wrap text-gray-600">{changeset.body}</p>
            )}
          </div>

          {/* Status and Basic Info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">Status:</span>{' '}
              <StatusBadge status={getStatusType(changeset.status)}>{changeset.status}</StatusBadge>
            </div>
            <div>
              <span className="font-medium">Base Branch:</span> {changeset.baseBranch}
            </div>
            <div>
              <span className="font-medium">Branch Name:</span> {changeset.branchName}
            </div>
            <div>
              <span className="font-medium">Base SHA:</span>{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">
                {changeset.baseSha.slice(0, 8)}
              </code>
            </div>
            <div>
              <span className="font-medium">Current SHA:</span>{' '}
              {changeset.headSha ? (
                <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">
                  {changeset.headSha.slice(0, 8)}
                </code>
              ) : (
                <span className="text-gray-400">N/A</span>
              )}
            </div>
            <div>
              <span className="font-medium">Worktree Status:</span>{' '}
              <StatusBadge status={getWorktreeStatusType()}>
                {worktreeStatus === 'available' ? 'Available' : 'Missing'}
              </StatusBadge>
            </div>
            <div>
              <span className="font-medium">Worktree Path:</span>{' '}
              {changeset.worktreePath || <span className="text-gray-400">N/A</span>}
            </div>
            <div>
              <span className="font-medium">Created:</span>{' '}
              {new Date(changeset.createdAt).toLocaleString()}
            </div>
            <div>
              <span className="font-medium">Updated:</span>{' '}
              {new Date(changeset.updatedAt).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-gray-900">Actions</h2>
        <div className="space-y-4">
          {/* Refresh Head */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-900">Refresh Head</h3>
              <p className="text-sm text-gray-600">Update the current head SHA from the worktree</p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={refreshHead}
              loading={isRefreshing}
              disabled={changeset.status !== 'active'}
            >
              Refresh Head
            </Button>
          </div>

          {/* Remove Worktree */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-900">Remove Worktree</h3>
              <p className="text-sm text-gray-600">Remove the worktree from the repository</p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={removeWorktree}
              loading={isRemoving}
              disabled={worktreeStatus === 'missing'}
            >
              Remove Worktree
            </Button>
          </div>

          {/* Close Changeset */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-900">Close Changeset</h3>
              <p className="text-sm text-gray-600">Mark the changeset as completed</p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleClose}
              loading={closeMutation.isPending}
              disabled={changeset.status !== 'active'}
            >
              Close Changeset
            </Button>
          </div>

          {/* Delete Changeset */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-900">Delete Changeset</h3>
              <p className="text-sm text-gray-600">Permanently delete this changeset</p>
            </div>
            <Button
              variant="danger"
              size="sm"
              onClick={handleDelete}
              loading={deleteMutation.isPending || isDeleting}
            >
              Delete Changeset
            </Button>
          </div>
        </div>

        {/* Error Messages */}
        {(refreshError || removeError) && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-800">{refreshError?.message || removeError?.message}</p>
            {refreshError && (
              <p className="mt-1 text-xs text-red-600">
                Make sure the worktree exists and is accessible
              </p>
            )}
            {removeError && (
              <p className="mt-1 text-xs text-red-600">
                Make sure you have permission to remove the worktree
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
