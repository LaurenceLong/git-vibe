/**
 * useWorktreeManagement Hook
 *
 * Manages worktree operations for both changesets and workitems.
 * Provides recreate and remove functionality with toast notifications.
 * Invalidates appropriate queries after successful operations.
 * Handles worktree missing state.
 *
 * @example
 * ```tsx
 * function WorktreeComponent({ changesetId }: { changesetId: string }) {
 *   const { removeWorktree, recreateWorktree, isLoading, error } = useWorktreeManagement({
 *     type: 'changeset',
 *     id: changesetId,
 *     projectId: 'project-123',
 *     worktreePath: '/path/to/worktree',
 *     branchName: 'feature-branch',
 *   });
 *
 *   const handleRemoveWorktree = async () => {
 *     await removeWorktree();
 *   };
 *
 *   const handleRecreateWorktree = async () => {
 *     await recreateWorktree();
 *   };
 *
 *   return (
 *     <div>
 *       <button onClick={handleRemoveWorktree} disabled={isLoading}>
 *         Remove Worktree
 *       </button>
 *       <button onClick={handleRecreateWorktree} disabled={isLoading}>
 *         Recreate Worktree
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { changesetsApi, workItemsApi } from '../lib/api';
import { useToast } from '../components/Toast';

export type WorktreeManagementType = 'changeset' | 'workitem';

export interface UseWorktreeManagementOptions {
  /** Type of entity (changeset or workitem) */
  type: WorktreeManagementType;
  /** The ID of the entity */
  id: string;
  /** The project ID */
  projectId: string;
  /** The worktree path */
  worktreePath: string | null;
  /** The branch name (required for recreate) */
  branchName: string;
}

export interface UseWorktreeManagementResult {
  /** Function to remove the worktree */
  removeWorktree: () => Promise<void>;
  /** Function to recreate the worktree */
  recreateWorktree: () => Promise<void>;
  /** Whether any operation is in progress */
  isLoading: boolean;
  /** Whether remove operation is in progress */
  isRemoving: boolean;
  /** Whether recreate operation is in progress */
  isRecreating: boolean;
  /** Any error that occurred during operations */
  error: Error | null;
}

/**
 * Hook to manage worktree operations for a changeset or workitem
 *
 * @param options - Configuration options for worktree management
 * @returns Object containing worktree management functions and state
 */
export function useWorktreeManagement(
  options: UseWorktreeManagementOptions
): UseWorktreeManagementResult {
  const { type, id, projectId, worktreePath, branchName } = options;
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  // Remove worktree mutation
  const removeMutation = useMutation({
    mutationFn: async () => {
      if (!worktreePath) {
        throw new Error('Worktree path is required to remove worktree');
      }

      let response;
      if (type === 'changeset') {
        response = await changesetsApi.removeWorktree(id);
      } else {
        response = await workItemsApi.removeWorktree(projectId, worktreePath);
      }
      return response.data;
    },
    onSuccess: () => {
      // Invalidate appropriate queries
      if (type === 'changeset') {
        queryClient.invalidateQueries({ queryKey: ['changeset', id] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['workitem', id] });
      }
      success('Worktree removed successfully');
    },
    onError: (err: Error) => {
      // Handle worktree missing state
      if (err.message.includes('not found') || err.message.includes('does not exist')) {
        showError('Worktree not found or already removed');
      } else {
        showError(`Failed to remove worktree: ${err.message}`);
      }
    },
  });

  // Recreate worktree mutation
  const recreateMutation = useMutation({
    mutationFn: async () => {
      if (!worktreePath) {
        throw new Error('Worktree path is required to recreate worktree');
      }

      let response;
      if (type === 'changeset') {
        // For changesets, recreation is not currently supported
        throw new Error('Worktree recreation is not supported for changesets');
      } else {
        response = await workItemsApi.removeWorktree(projectId, worktreePath);
      }
      return response.data;
    },
    onSuccess: () => {
      // Invalidate appropriate queries
      if (type === 'changeset') {
        queryClient.invalidateQueries({ queryKey: ['changeset', id] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['workitem', id] });
      }
      success('Worktree removed successfully');
    },
    onError: (err: Error) => {
      showError(`Failed to recreate worktree: ${err.message}`);
    },
  });

  return {
    removeWorktree: () => removeMutation.mutateAsync(),
    recreateWorktree: () => recreateMutation.mutateAsync(),
    isLoading: removeMutation.isPending || recreateMutation.isPending,
    isRemoving: removeMutation.isPending,
    isRecreating: recreateMutation.isPending,
    error: (removeMutation.error || recreateMutation.error) as Error | null,
  };
}
