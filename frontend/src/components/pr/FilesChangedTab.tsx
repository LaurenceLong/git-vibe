/**
 * FilesChangedTab Component
 *
 * GitHub-style "Files changed" review UI for PR Detail
 *
 * Features:
 * - Left sidebar: file tree + changed files list (name, status, +/-, filter)
 * - Right: unified diff viewer with line numbers, syntax highlighting
 * - Inline comment buttons on each line
 * - General "Conversation" panel
 * - Comments create messages on work item conversation and trigger agent runs
 */

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { pullRequestsApi } from '@/lib/api';
import { ChangedFilesTree } from './ChangedFilesTree';
import { EnhancedDiffViewer } from './EnhancedDiffViewer';
import { InlineCommentComposer } from './InlineCommentComposer';
import { parseDiff } from '@/utils/diffParser';
import { EmptyState } from '@/components/ui/empty-state';
import { FileCode, Search, X } from 'lucide-react';
import type { ThreadAnchor } from './EnhancedDiffViewer';

/**
 * Props for the FilesChangedTab component
 */
export interface FilesChangedTabProps {
  /** The PR ID */
  prId: string;
  /** The Work Item ID (for comments/threads) */
  workItemId: string | null | undefined;
  /** Current user name */
  currentUserName?: string;
  /** Whether this tab is currently active */
  isActive?: boolean;
}

/**
 * FilesChangedTab component
 *
 * @param prId - The ID of PR to display file changes for
 * @param workItemId - The work item ID for comments/threads
 */
export function FilesChangedTab({
  prId,
  workItemId,
  currentUserName = 'User',
  isActive = true,
}: FilesChangedTabProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileFilter, setFileFilter] = useState('');
  const [commentingLine, setCommentingLine] = useState<{
    lineNumber: number;
    side: 'base' | 'head';
    filepath: string;
  } | null>(null);
  const [showGeneralConversation] = useState(true);

  // Load diff - only when tab is active
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
    enabled: isActive && !!prId,
    retry: 2,
  });

  // Parse changed files from diff
  const changedFiles = useMemo(() => {
    if (!diff || typeof diff !== 'string') return [];
    return parseDiff(diff);
  }, [diff]);

  // Auto-select first file when files are loaded
  useMemo(() => {
    if (changedFiles.length > 0 && !selectedFile) {
      setSelectedFile(changedFiles[0].filepath);
    }
  }, [changedFiles, selectedFile]);

  // Threads functionality removed
  const threadAnchors: ThreadAnchor[] = [];

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

  // Empty diff state
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
    <div className="flex h-[calc(100vh-300px)] gap-4">
      {/* Left Sidebar: Changed Files List */}
      <div className="flex w-80 flex-shrink-0 flex-col rounded-lg border bg-white shadow-sm">
        <div className="flex-shrink-0 border-b border-gray-200 p-3">
          {/* File Filter */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              id="file-tree-filter-field"
              placeholder="Filter changed files"
              value={fileFilter}
              onChange={(e) => setFileFilter(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white py-1.5 pl-8 pr-7 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              aria-label="Filter changed files"
              autoComplete="off"
            />
            {fileFilter && (
              <button
                onClick={() => setFileFilter('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label="Clear filter"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ChangedFilesTree
            files={changedFiles}
            selectedFile={selectedFile}
            onFileSelect={(filepath) => {
              setSelectedFile(filepath);
              setCommentingLine(null);
            }}
            filter={fileFilter}
          />
        </div>
      </div>

      {/* Right Side: Diff Viewer + Conversation */}
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {/* Diff Viewer */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-lg border bg-white shadow-sm">
          <div className="flex-shrink-0 border-b border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900">
              {selectedFile || 'Select a file to view changes'}
            </h3>
          </div>
          <div className="flex-1 overflow-auto">
            <EnhancedDiffViewer
              diff={diff}
              filepath={selectedFile}
              threads={threadAnchors.filter((t) => t.filepath === selectedFile)}
              onAddComment={(lineNumber, side) => {
                if (selectedFile) {
                  setCommentingLine({ lineNumber, side, filepath: selectedFile });
                }
              }}
              showInlineButtons={false}
            />
          </div>
        </div>

        {/* Inline Comment Composer */}
        {commentingLine && (
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <InlineCommentComposer
              lineNumber={commentingLine.lineNumber}
              side={commentingLine.side}
              filepath={commentingLine.filepath}
              onSubmit={handleCreateInlineComment}
              onCancel={() => setCommentingLine(null)}
              isSubmitting={false}
            />
          </div>
        )}

      </div>
    </div>
  );
}
