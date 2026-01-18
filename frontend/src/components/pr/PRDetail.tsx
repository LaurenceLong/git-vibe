/**
 * PRDetail Component
 *
 * Main page for viewing and managing a Pull Request
 *
 * Features:
 * - Display PR metadata (title, body, status)
 * - Show worktree status with recreate action
 * - Render tab-based interface (Overview, Conversation, Files Changed, Checks)
 * - Handle merge/close actions
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { pullRequestsApi, workItemsApi } from '@/lib/api';
import { useMergePR, useClosePR } from '@/hooks/usePR';
import { OverviewTab } from '@/components/pr/OverviewTab';
import { ConversationTab } from '@/components/pr/ConversationTab';
import { CommitsTab } from '@/components/pr/CommitsTab';
import { FilesChangedTab } from '@/components/pr/FilesChangedTab';
import { ChecksTab } from '@/components/pr/ChecksTab';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/status-badge';
import { GitMerge, X as GitClose, CheckCircle, Clock } from 'lucide-react';
import { formatDateTime } from '@/lib/datetime';
import { Badge } from '@/components/ui/badge';

// Import tabs components directly
import { Tab, TabPanel, TabList, TabPanels } from '@/components/ui/Tabs';

/**
 * Props for the PRDetail component
 */
export interface PRDetailProps {
  /** The PR ID */
  prId: string;
}

/**
 * PRDetail component
 * Main page for viewing and managing a Pull Request
 *
 * @param prId - The PR ID
 */
export function PRDetail({ prId }: PRDetailProps) {
  // Merge/Close actions - MUST be called before any early returns (Rules of Hooks)
  const { mergePR, isLoading: isMerging } = useMergePR(prId);
  const { closePR, isLoading: isClosing } = useClosePR(prId);

  // Fetch PR data
  const {
    data: pr,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['pull-request', prId],
    queryFn: () => pullRequestsApi.get(prId).then((res) => res.data),
  });

  // Tab state management
  const [activeTab, setActiveTab] = useState('overview');

  // Fetch associated WorkItem - only when needed (for header actions or when checks tab is active)
  const shouldFetchWorkItem = activeTab === 'checks' || (pr?.status === 'open' && pr?.workItemId);
  const { data: workItem } = useQuery({
    queryKey: ['workitem', pr?.workItemId],
    queryFn: async () => {
      if (!pr?.workItemId) return null;
      const response = await workItemsApi.get(pr.workItemId);
      return response.data;
    },
    enabled: shouldFetchWorkItem && !!pr?.workItemId,
  });

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
          <p className="mt-2 text-sm text-gray-600">Loading PR...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center text-red-600">
          <p className="font-medium">Error loading PR</p>
          <p className="mt-1 text-sm">{error instanceof Error ? error.message : 'Unknown error'}</p>
          <div className="mt-4 text-sm text-gray-600">Back to Pull Requests</div>
        </div>
      </div>
    );
  }

  // Not found state
  if (!pr) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center text-gray-600">
          <p>PR not found</p>
          <div className="mt-4 text-sm text-gray-600">Back to Pull Requests</div>
        </div>
      </div>
    );
  }

  // Get PR status
  const prStatus = pr.status;

  // Determine worktree status for actions - only check if workItem is loaded
  const actionsDisabled = workItem ? !workItem.worktreePath : false;

  const getStatusType = (status: string): 'success' | 'error' | 'info' | 'neutral' | 'warning' => {
    switch (status) {
      case 'open':
        return 'info';
      case 'merged':
        return 'success';
      case 'closed':
        return 'neutral';
      default:
        return 'neutral';
    }
  };

  const handleMerge = async () => {
    if (window.confirm('Are you sure you want to merge this PR?')) {
      try {
        await mergePR(pr.mergeStrategy);
      } catch (error) {
        console.error('Failed to merge PR:', error);
      }
    }
  };

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
      {/* PR Header */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex-1">
            <div className="mb-2 flex items-center space-x-3">
              <StatusBadge status={getStatusType(prStatus)}>{prStatus}</StatusBadge>
              <h1 className="text-2xl font-bold text-gray-900">{pr.title}</h1>
            </div>
            {pr.description && <p className="mt-2 text-gray-600">{pr.description}</p>}
          </div>
          <div className="ml-4 flex items-center space-x-2">
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

        {/* PR Metadata */}
        <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
          <div>
            <span className="font-medium text-gray-700">Status:</span>{' '}
            <span className="font-semibold text-gray-900">{prStatus}</span>
          </div>
          <div>
            <span className="font-medium text-gray-700">Branch:</span>{' '}
            <span className="text-gray-900">
              {pr.sourceBranch} → {pr.targetBranch}
            </span>
          </div>
          <div>
            <span className="font-medium text-gray-700">Created:</span>{' '}
            <span className="text-gray-900">{formatDateTime(pr.createdAt)}</span>
          </div>
          {workItem?.headSha && (
            <div>
              <span className="font-medium text-gray-700">Head SHA:</span>{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5 text-xs text-gray-700">
                {workItem.headSha.slice(0, 8)}
              </code>
            </div>
          )}
          {pr.mergedAt && (
            <div>
              <span className="font-medium text-gray-700">Merged:</span>{' '}
              <span className="text-gray-900">{formatDateTime(pr.mergedAt)}</span>
            </div>
          )}
          {pr.status === 'merged' && (
            <div>
              <span className="font-medium text-gray-700">Sync Status:</span>{' '}
              <Badge
                variant={pr.syncedCommitSha ? 'success' : 'warning'}
                className="ml-1 inline-flex items-center gap-1"
              >
                {pr.syncedCommitSha ? (
                  <>
                    <CheckCircle className="h-3 w-3" />
                    Synced
                  </>
                ) : (
                  <>
                    <Clock className="h-3 w-3" />
                    Pending Sync
                  </>
                )}
              </Badge>
              {pr.syncedCommitSha && (
                <span className="ml-2 text-xs text-gray-500">
                  (Commit: {pr.syncedCommitSha.slice(0, 8)})
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div>
        <TabList className="px-6">
          <Tab
            value="overview"
            onClick={() => setActiveTab('overview')}
            className={
              activeTab === 'overview'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }
            aria-selected={activeTab === 'overview'}
          >
            Overview
          </Tab>
          <Tab
            value="conversation"
            onClick={() => setActiveTab('conversation')}
            className={
              activeTab === 'conversation'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }
            aria-selected={activeTab === 'conversation'}
          >
            Conversation
          </Tab>
          <Tab
            value="commits"
            onClick={() => setActiveTab('commits')}
            className={
              activeTab === 'commits'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }
            aria-selected={activeTab === 'commits'}
          >
            Commits
          </Tab>
          <Tab
            value="files"
            onClick={() => setActiveTab('files')}
            className={
              activeTab === 'files'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }
            aria-selected={activeTab === 'files'}
          >
            Files changed
          </Tab>
          <Tab
            value="checks"
            onClick={() => setActiveTab('checks')}
            className={
              activeTab === 'checks'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }
            aria-selected={activeTab === 'checks'}
          >
            Checks
          </Tab>
        </TabList>
        <TabPanels>
          <TabPanel value="overview" className={activeTab === 'overview' ? '' : 'hidden'}>
            {activeTab === 'overview' && (
              <OverviewTab
                pr={pr}
                onNavigateToTab={setActiveTab}
                isActive={activeTab === 'overview'}
              />
            )}
          </TabPanel>
          <TabPanel value="conversation" className={activeTab === 'conversation' ? '' : 'hidden'}>
            {activeTab === 'conversation' && (
              <ConversationTab
                prId={prId}
                workItemId={pr.workItemId}
                isActive={activeTab === 'conversation'}
              />
            )}
          </TabPanel>
          <TabPanel value="commits" className={activeTab === 'commits' ? '' : 'hidden'}>
            {activeTab === 'commits' && (
              <CommitsTab
                prId={prId}
                workItemId={pr.workItemId}
                isActive={activeTab === 'commits'}
              />
            )}
          </TabPanel>
          <TabPanel value="files" className={activeTab === 'files' ? '' : 'hidden'}>
            {activeTab === 'files' && (
              <FilesChangedTab prId={prId} isActive={activeTab === 'files'} />
            )}
          </TabPanel>
          <TabPanel value="checks" className={activeTab === 'checks' ? '' : 'hidden'}>
            {activeTab === 'checks' && (
              <ChecksTab
                prId={prId}
                workItemId={pr.workItemId}
                agentRuns={[]}
                worktreeStatus={workItem?.worktreePath ? 'present' : 'missing'}
              />
            )}
          </TabPanel>
        </TabPanels>
      </div>
    </div>
  );
}
