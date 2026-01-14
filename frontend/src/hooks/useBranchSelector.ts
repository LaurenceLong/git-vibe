/**
 * useBranchSelector Hook
 *
 * Fetches available branches for a project.
 * Caches branches data with project ID.
 * Handles empty branches list.
 * Supports search/filter if needed.
 *
 * @example
 * ```tsx
 * function BranchSelectorComponent({ projectId }: { projectId: string }) {
 *   const { branches, isLoading, error, refetch } = useBranchSelector(projectId);
 *
 *   if (isLoading) return <div>Loading branches...</div>;
 *   if (error) return <div>Error loading branches</div>;
 *
 *   return (
 *     <div>
 *       <select>
 *         {branches?.map((branch) => (
 *           <option key={branch.name} value={branch.name}>
 *             {branch.name}
 *           </option>
 *         ))}
 *       </select>
 *       <button onClick={refetch}>Refresh Branches</button>
 *     </div>
 *   );
 * }
 * ```
 */

import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '../lib/api';

interface Branch {
  name: string;
  isDefault?: boolean;
  isRemote?: boolean;
  lastCommit?: {
    sha: string;
    message: string;
    author: string;
    date: Date;
  };
}

interface UseBranchSelectorResult {
  /** The list of available branches */
  branches: Branch[] | undefined;
  /** Whether the branches are loading */
  isLoading: boolean;
  /** Any error that occurred while fetching branches */
  error: Error | null;
  /** Function to refetch the branches */
  refetch: () => void;
}

/**
 * Hook to fetch available branches for a project
 *
 * @param projectId - The ID of the project to fetch branches for
 * @returns Object containing branches data, loading state, error, and refetch function
 */
export function useBranchSelector(projectId: string): UseBranchSelectorResult {
  const query = useQuery({
    queryKey: ['branches', projectId],
    queryFn: async () => {
      const response = await projectsApi.getBranches(projectId);
      return response.data as Branch[];
    },
    enabled: !!projectId,
    retry: 2,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  return {
    branches: query.data,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}
