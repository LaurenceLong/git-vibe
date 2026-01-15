import { useState, useMemo } from 'react';
import { ChangeSet, ReviewThread, WorktreeStatus } from '@/types';
import { useDiffView } from '@/hooks/useDiffView';
import { useReviewThreads } from '@/hooks/useReviewThreads';
import { DiffViewer } from '@/components/diff/DiffViewer';
import { ThreadComposer } from '@/components/review/ThreadComposer';
import { CommentComposer } from '@/components/review/CommentComposer';
import { ThreadActions } from '@/components/review/ThreadActions';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { FileCode, MessageSquare, Filter, AlertTriangle } from 'lucide-react';

/**
 * Props for the DiffReviewTab component
 */
export interface DiffReviewTabProps {
  changeset: ChangeSet;
  diff?: string;
  worktreeStatus?: WorktreeStatus;
}

/**
 * DiffReviewTab component
 * Displays diff and review functionality for a changeset
 *
 * Features:
 * - Load and display diff using useDiffView hook
 * - Display review threads using useReviewThreads hook
 * - Show thread anchors in diff
 * - Create new threads via modal
 * - Add comments to threads
 * - Resolve/unresolve threads
 */
export function DiffReviewTab({ changeset, worktreeStatus = 'present' }: DiffReviewTabProps) {
  const [isThreadModalOpen, setIsThreadModalOpen] = useState(false);
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved' | 'outdated'>('all');

  // Load diff
  const { diff, isLoading: isLoadingDiff, error: diffError } = useDiffView(changeset.id);

  // Load and manage review threads
  const {
    threads,
    isLoading: isLoadingThreads,
    error: threadsError,
    createThread,
    addComment,
    resolveThread,
    unresolveThread,
    addressWithAgent,
    isAddressingWithAgent,
  } = useReviewThreads(changeset.id);

  // Check if worktree is present
  const worktreePresent = worktreeStatus === 'present';

  // Filter threads by status
  const filteredThreads = useMemo(() => {
    if (!threads) return [];
    if (statusFilter === 'all') return threads;
    return threads.filter((thread) => thread.status === statusFilter);
  }, [threads, statusFilter]);

  // Count threads by status
  const threadCounts = useMemo(() => {
    if (!threads) return { all: 0, open: 0, resolved: 0, outdated: 0 };
    return {
      all: threads.length,
      open: threads.filter((t) => t.status === 'open').length,
      resolved: threads.filter((t) => t.status === 'resolved').length,
      outdated: threads.filter((t) => t.status === 'outdated').length,
    };
  }, [threads]);

  // Handle thread modal
  const handleOpenThreadModal = () => {
    setIsThreadModalOpen(true);
  };

  const handleCloseThreadModal = () => {
    setIsThreadModalOpen(false);
  };

  const handleCreateThread = async (data: { file: string; line: number; comment: string }) => {
    await createThread(data);
    handleCloseThreadModal();
  };

  // Handle thread expansion
  const toggleThreadExpansion = (threadId: string) => {
    setExpandedThreads((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(threadId)) {
        newSet.delete(threadId);
      } else {
        newSet.add(threadId);
      }
      return newSet;
    });
  };

  // Extract line numbers from threads for highlighting in diff
  const threadLines = threads
    ?.filter((thread) => thread.status !== 'outdated')
    .map((thread) => {
      const match = thread.anchor.match(/:(\d+)$/);
      return match ? parseInt(match[1], 10) : null;
    })
    .filter((line): line is number => line !== null);

  // Handle resolve all open threads
  const handleResolveAll = async () => {
    const openThreads = threads?.filter((t) => t.status === 'open') || [];
    await Promise.all(openThreads.map((t) => resolveThread(t.id)));
  };

  // Loading state
  if (isLoadingDiff || isLoadingThreads) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <Skeleton className="mb-4 h-7 w-1/4" />
          <Skeleton className="h-96 w-full" />
        </div>
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <Skeleton className="mb-4 h-7 w-1/4" />
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-md border p-4">
                <Skeleton className="mb-2 h-5 w-1/3" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (diffError || threadsError) {
    return (
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="text-center text-red-600">
          <p className="font-medium">Error loading diff or reviews</p>
          <p className="mt-1 text-sm">
            {diffError?.message || threadsError?.message || 'Unknown error'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Diff Section */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Diff</h2>
          <Button
            variant="primary"
            size="sm"
            onClick={handleOpenThreadModal}
            disabled={!worktreePresent}
          >
            Create Thread
          </Button>
        </div>
        {diff ? (
          <DiffViewer diff={diff} threadLines={threadLines} />
        ) : (
          <EmptyState
            icon={FileCode}
            title="No diff available yet"
            description="Changeset must have a head commit to show diff"
          />
        )}
      </div>

      {/* Worktree Warning */}
      {!worktreePresent && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-600" />
            <div>
              <h3 className="font-medium text-yellow-900">Worktree Not Available</h3>
              <p className="mt-1 text-sm text-yellow-800">
                The worktree for this changeset is not available. Please recreate the worktree to
                view diff and manage review threads.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Review Threads Section */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Review Threads</h2>

          {/* Filter Buttons */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <div className="flex rounded-md border border-gray-200 p-1">
              <button
                onClick={() => setStatusFilter('all')}
                className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                  statusFilter === 'all'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                All ({threadCounts.all})
              </button>
              <button
                onClick={() => setStatusFilter('open')}
                className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                  statusFilter === 'open'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                Open ({threadCounts.open})
              </button>
              <button
                onClick={() => setStatusFilter('resolved')}
                className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                  statusFilter === 'resolved'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                Resolved ({threadCounts.resolved})
              </button>
              <button
                onClick={() => setStatusFilter('outdated')}
                className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                  statusFilter === 'outdated'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                Outdated ({threadCounts.outdated})
              </button>
            </div>
          </div>
        </div>

        {/* Resolve All Button (only shown when filtering by open) */}
        {statusFilter === 'open' && threadCounts.open > 0 && (
          <div className="mb-4 flex justify-end">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleResolveAll}
              disabled={!worktreePresent}
            >
              Resolve All
            </Button>
          </div>
        )}

        {filteredThreads && filteredThreads.length > 0 ? (
          <div className="space-y-4">
            {filteredThreads.map((thread) => (
              <div key={thread.id} className="rounded-md border p-4">
                {/* Thread Header */}
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex-1">
                    <div className="mb-1 flex items-center space-x-2">
                      <span className="text-sm text-gray-600">{thread.anchor}</span>
                      {thread.severity && (
                        <span className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800">
                          {thread.severity}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleThreadExpansion(thread.id)}
                  >
                    {expandedThreads.has(thread.id) ? '▼' : '▶'}
                  </Button>
                </div>

                {/* Thread Actions and Comments */}
                {expandedThreads.has(thread.id) && (
                  <div className="mt-3 space-y-4">
                    {/* Thread Actions */}
                    <ThreadActions
                      status={thread.status}
                      worktreePresent={isWorktreePresent}
                      isAddressingWithAgent={isAddressingWithAgent}
                      onResolve={() => resolveThread(thread.id)}
                      onUnresolve={() => unresolveThread(thread.id)}
                      onAddressWithAgent={(agentKey, prompt) =>
                        addressWithAgent(thread.id, { agentKey, prompt })
                      }
                      createdAt={thread.createdAt}
                      updatedAt={thread.updatedAt}
                    />

                    {/* Thread Comments */}
                    <div className="rounded-md bg-gray-50 p-3 text-sm text-gray-700">
                      <p className="italic text-gray-500">Thread comments would appear here</p>
                    </div>

                    {/* Add Comment Form */}
                    <div className="border-t pt-3">
                      <CommentComposer
                        onSubmit={(data) => addComment(thread.id, data)}
                        placeholder="Add a comment to this thread..."
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={MessageSquare}
            title={statusFilter === 'all' ? 'No review threads yet' : `No ${statusFilter} threads`}
            description={
              statusFilter === 'all'
                ? "Click 'Create Thread' to start a review discussion"
                : `Change filter to see all threads`
            }
            action={
              statusFilter === 'all' && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleOpenThreadModal}
                  disabled={!worktreePresent}
                >
                  Create Thread
                </Button>
              )
            }
          />
        )}
      </div>

      {/* Create Thread Modal */}
      <Modal
        isOpen={isThreadModalOpen}
        onClose={handleCloseThreadModal}
        title="Create Review Thread"
        size="lg"
      >
        <ThreadComposer onSubmit={handleCreateThread} onCancel={handleCloseThreadModal} />
      </Modal>
    </div>
  );
}
