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

import { useQuery } from '@tanstack/react-query';
import { pullRequestsApi, importsApi } from '@/lib/api';
import { useWorkItem } from '@/hooks/useWorkItem';
import { ControlledTabs } from '@/components/ui/Tabs';
import { OverviewTab } from '@/components/pr/OverviewTab';
import { ConversationTab } from '@/components/pr/ConversationTab';
import { ChecksTab } from '@/components/pr/ChecksTab';
import { WorktreeStatusComponent } from '@/components/worktree/WorktreeStatus';
import { useWorktreeManagement } from '@/hooks/useWorktreeManagement';

// Import tabs components directly
import { Tab, TabPanel } from '@/components/ui/Tabs';

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
  // Fetch PR data
  const {
    data: pr,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['pull-request', prId],
    queryFn: () => pullRequestsApi.get(prId).then((res) => res.data),
  });

  // Fetch associated WorkItem for worktree management
  const { data: workItem } = useWorkItem(pr?.workItemId || '');

  // Worktree management (using WorkItem's workspace)
  const worktreeManagement = useWorktreeManagement({
    id: workItem?.id || '',
    projectId: workItem?.projectId || '',
    worktreePath: workItem?.worktreePath || null,
    branchName: workItem?.headBranch || '',
  });

  // Fetch diff
  useQuery({
    queryKey: ['diff', prId, workItem?.headSha],
    queryFn: () => pullRequestsApi.getDiff(prId).then((res) => res.data),
    enabled: !!pr && !!workItem?.headSha,
  });

  // Fetch imports (now associated with PR)
  useQuery({
    queryKey: ['imports', prId],
    queryFn: () => importsApi.list(prId).then((res) => res.data),
    enabled: !!pr,
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

  // Determine worktree status
  const getWorktreeStatus = (): 'present' | 'missing' | 'recreating' => {
    if (worktreeManagement.isRecreating) return 'recreating';
    return workItem?.worktreePath ? 'present' : 'missing';
  };

  return (
    <div className="space-y-6">
      {/* PR Header */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{pr.title}</h1>
            {pr.description && <p className="mt-2 text-gray-600">{pr.description}</p>}
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
            <span className="text-gray-900">{new Date(pr.createdAt).toLocaleString()}</span>
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
              <span className="text-gray-900">{new Date(pr.mergedAt).toLocaleString()}</span>
            </div>
          )}
        </div>

        {/* Worktree Status */}
        <WorktreeStatusComponent
          status={getWorktreeStatus()}
          path={workItem?.worktreePath || null}
          branchName={workItem?.headBranch || ''}
          projectId={workItem?.projectId || ''}
          createdAt={workItem?.createdAt}
          updatedAt={workItem?.updatedAt}
          onRecreate={worktreeManagement.recreateWorktree}
          onRemove={worktreeManagement.removeWorktree}
          isRecreating={worktreeManagement.isRecreating}
          isRemoving={worktreeManagement.isRemoving}
          error={worktreeManagement.error?.message}
        />
      </div>

      {/* Tabs */}
      <ControlledTabs defaultValue="overview">
        <Tab value="overview">Overview</Tab>
        <Tab value="conversation">Conversation</Tab>
        <Tab value="checks">Checks</Tab>
        <Tab value="imports">Imports</Tab>

        <TabPanel value="overview">
          <OverviewTab pr={pr} worktreeStatus={getWorktreeStatus()} />
        </TabPanel>

        <TabPanel value="conversation">
          <ConversationTab prId={prId} />
        </TabPanel>

        <TabPanel value="checks">
          <ChecksTab prId={prId} agentRuns={[]} worktreeStatus={getWorktreeStatus()} />
        </TabPanel>

        <TabPanel value="imports">
          <div className="rounded-lg border bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold text-gray-900">Imports</h2>
            <p className="text-sm text-gray-600">
              Imports functionality will be implemented in a future update.
            </p>
          </div>
        </TabPanel>
      </ControlledTabs>
    </div>
  );
}
