/**
 * useWorktreeManagement Hook
 *
 * Manages worktree operations for WorkItems.
 * Provides recreate and remove functionality with toast notifications.
 * Invalidates appropriate queries after successful operations.
 * Handles worktree missing state.
 *
 * @example
 * ```tsx
 * function WorktreeComponent({ workItemId }: { workItemId: string }) {
 *   const { removeWorktree, recreateWorktree, isLoading, error } = useWorktreeManagement({
 *     id: workItemId,
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
import { workItemsApi } from '../lib/api';
import { useToast } from '../components/Toast';

export interface UseWorktreeManagementOptions {
  /** The ID of the WorkItem */
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
  removeWorktree: () => Promise<import('git-vibe-shared').WorkItemDTO>;
  /** Function to recreate the worktree */
  recreateWorktree: () => Promise<import('git-vibe-shared').WorkItemDTO>;
  /** Whether any operation is in progress */
  isLoading: boolean;
  /** Whether remove operation is in progress */
  isRemoving: boolean;
  /** Whether recreate operation is in progress */
  isRecreating: boolean;
  /** Any error that occurred during operations */
  error: Error | null;
  /** Updated WorkItem data after operation */
  workItem?: import('git-vibe-shared').WorkItemDTO;
}

/**
 * Hook to manage worktree operations for a WorkItem
 *
 * @param options - Configuration options for worktree management
 * @returns Object containing worktree management functions and state
 */
export function useWorktreeManagement(
  options: UseWorktreeManagementOptions
): UseWorktreeManagementResult {
  const { id, worktreePath } = options;
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  // Remove worktree mutation
  const removeMutation = useMutation({
    mutationFn: async () => {
      if (!worktreePath) {
        throw new Error('Worktree path is required to remove worktree');
      }

      // Close the WorkItem to trigger worktree cleanup
      const response = await workItemsApi.update(id, { status: 'closed' });
      return response.data;
    },
    onSuccess: () => {
      // Invalidate WorkItem query
      queryClient.invalidateQueries({ queryKey: ['workitem', id] });
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

      // Close the WorkItem to trigger worktree cleanup
      const response = await workItemsApi.update(id, { status: 'closed' });
      return response.data;
    },
    onSuccess: () => {
      // Invalidate WorkItem query
      queryClient.invalidateQueries({ queryKey: ['workitem', id] });
      success('Worktree removed successfully. The workspace will be reinitialized on next task.');
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
    workItem: removeMutation.data || recreateMutation.data,
  };
}
