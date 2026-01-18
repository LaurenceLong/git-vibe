/**
 * FilesChangedTab Component
 *
 * Displays PR file changes (diff)
 *
 * Features:
 * - Display diff for the PR
 * - Show file changes with syntax highlighting
 * - Handle empty diff state
 */

import { useQuery } from '@tanstack/react-query';
import { pullRequestsApi } from '@/lib/api';
import { DiffViewer } from '@/components/diff/DiffViewer';
import { EmptyState } from '@/components/ui/empty-state';
import { FileCode } from 'lucide-react';

/**
 * Props for the FilesChangedTab component
 */
export interface FilesChangedTabProps {
  /** The PR ID */
  prId: string;
}

/**
 * FilesChangedTab component
 *
 * @param prId - The ID of PR to display file changes for
 */
export function FilesChangedTab({ prId }: FilesChangedTabProps) {
  // Load diff
  const {
    data: diff,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['diff', prId],
    queryFn: async () => {
      try {
        const response = await pullRequestsApi.getDiff(prId);
        const data = response.data;
        // API returns { diff, baseSha, headSha }, extract the diff string
        if (typeof data === 'string') {
          return data;
        }
        if (data && typeof data === 'object' && 'diff' in data) {
          return typeof data.diff === 'string' ? data.diff : '';
        }
        return '';
      } catch (error) {
        console.error('Failed to fetch diff:', error);
        return '';
      }
    },
    enabled: !!prId,
    retry: 2,
  });

  // Loading state
  if (isLoading) {
    return (
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="py-12 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
          <p className="mt-2 text-sm text-gray-600">Loading file changes...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="text-center text-red-600">
          <p className="font-medium">Error loading file changes</p>
          <p className="mt-1 text-sm">{error.message}</p>
        </div>
      </div>
    );
  }

  // Empty diff state - ensure diff is a string before calling trim()
  if (!diff || typeof diff !== 'string' || diff.trim() === '') {
    return (
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <EmptyState
          icon={FileCode}
          title="No file changes"
          description="There are no differences between the base and current commits."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-gray-900">Files Changed</h2>
        <DiffViewer diff={diff} />
      </div>
    </div>
  );
}
