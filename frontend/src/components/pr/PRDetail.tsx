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

import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { changesetsApi, diffsApi, agentRunsApi, importsApi } from '@/lib/api';
import { ControlledTabs } from '@/components/ui/Tabs';
import { OverviewTab } from '@/components/pr/OverviewTab';
import { ConversationTab } from '@/components/pr/ConversationTab';
import { DiffReviewTab } from '@/components/changesets/DiffReviewTab';
import { ChecksTab } from '@/components/pr/ChecksTab';
import { ImportsTab } from '@/components/changesets/ImportsTab';
import { WorktreeStatus } from '@/components/worktree/WorktreeStatus';
import { useWorktreeManagement } from '@/hooks/useWorktreeManagement';

// Import tabs components directly
import { Tab, TabPanel } from '@/components/ui/Tabs';

/**
 * Props for the PRDetail component
 */
export interface PRDetailProps {
  /** The PR ID (changesetId) */
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
    queryKey: ['changeset', prId],
    queryFn: () => changesetsApi.get(prId).then((res) => res.data),
  });

  // Worktree management
  const worktreeManagement = useWorktreeManagement({
    type: 'changeset',
    id: prId,
    projectId: pr?.projectId || '',
    worktreePath: pr?.worktreePath || null,
    branchName: pr?.branchName || '',
  });

  // Fetch diff
  const { data: diff } = useQuery({
    queryKey: ['diff', prId, pr?.headSha],
    queryFn: () => diffsApi.get(prId).then((res) => res.data),
    enabled: !!pr && !!pr.headSha,
  });

  // Fetch agent runs
  const { data: agentRuns } = useQuery({
    queryKey: ['agent-runs', prId],
    queryFn: () => agentRunsApi.listByChangeset(prId).then((res) => res.data),
    enabled: !!pr,
    refetchInterval: (data) => {
      // Only poll if there are any runs with status 'queued' or 'running'
      if (!data) return false;
      const hasActiveRuns = data?.some((run: any) => run.status === 'queued' || run.status === 'running') ?? false;
      return hasActiveRuns ? 1500 : false;
    },
  });

  // Fetch imports
  const { data: imports } = useQuery({
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
          <Link to="/changesets" className="mt-4 inline-block text-blue-600 hover:underline">
            Back to Pull Requests
          </Link>
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
          <Link to="/changesets" className="mt-4 inline-block text-blue-600 hover:underline">
            Back to Pull Requests
          </Link>
        </div>
      </div>
    );
  }

  // Get PR status from prStatus field
  const prStatus = pr.prStatus || 'open';

  // Determine worktree status
  const getWorktreeStatus = (): 'present' | 'missing' | 'recreating' => {
    if (worktreeManagement.isRecreating) return 'recreating';
    return pr?.worktreePath ? 'present' : 'missing';
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div>
        <Link to="/changesets" className="text-sm text-blue-600 hover:underline">
          ← Back to Pull Requests
        </Link>
      </div>

      {/* PR Header */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{pr.title}</h1>
            {pr.body && <p className="mt-2 text-gray-600">{pr.body}</p>}
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
              {pr.branchName} → {pr.baseBranch}
            </span>
          </div>
          <div>
            <span className="font-medium text-gray-700">Created:</span>{' '}
            <span className="text-gray-900">{new Date(pr.createdAt).toLocaleString()}</span>
          </div>
          {pr.headSha && (
            <div>
              <span className="font-medium text-gray-700">Head SHA:</span>{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5 text-xs text-gray-700">
                {pr.headSha.slice(0, 8)}
              </code>
            </div>
          )}
          {pr.mergedAt && (
            <div>
              <span className="font-medium text-gray-700">Merged:</span>{' '}
              <span className="text-gray-900">{new Date(pr.mergedAt).toLocaleString()}</span>
            </div>
          )}
          {pr.closedAt && (
            <div>
              <span className="font-medium text-gray-700">Closed:</span>{' '}
              <span className="text-gray-900">{new Date(pr.closedAt).toLocaleString()}</span>
            </div>
          )}
        </div>

        {/* Worktree Status */}
        <WorktreeStatus
          status={getWorktreeStatus()}
          path={pr?.worktreePath || null}
          branchName={pr?.branchName || ''}
          projectId={pr?.projectId || ''}
          createdAt={pr?.createdAt}
          updatedAt={pr?.updatedAt}
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
        <Tab value="files-changed">Files Changed</Tab>
        <Tab value="checks">Checks</Tab>
        <Tab value="imports">Imports</Tab>

        <TabPanel value="overview">
          <OverviewTab pr={pr} worktreeStatus={getWorktreeStatus()} />
        </TabPanel>

        <TabPanel value="conversation">
          <ConversationTab prId={prId} />
        </TabPanel>

        <TabPanel value="files-changed">
          <DiffReviewTab changeset={pr} diff={diff} worktreeStatus={getWorktreeStatus()} />
        </TabPanel>

        <TabPanel value="checks">
          <ChecksTab prId={prId} agentRuns={agentRuns || []} worktreeStatus={getWorktreeStatus()} />
        </TabPanel>

        <TabPanel value="imports">
          <ImportsTab changesetId={prId} imports={imports || []} />
        </TabPanel>
      </ControlledTabs>
    </div>
  );
}
