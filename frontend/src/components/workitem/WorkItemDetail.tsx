/**
 * WorkItemDetail Component
 *
 * Main WorkItem detail page with tabs for Discussion, Agent Config, and PR Status
 */

import { useState } from 'react';
import { useWorkItem, useCloseWorkItem, useDeleteWorkItem } from '@/hooks/useWorkItem';
import { useWorktreeManagement } from '@/hooks/useWorktreeManagement';
import { ControlledTabs, Tab, TabPanel } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { WorktreeStatusComponent } from '@/components/worktree/WorktreeStatus';
import { AlertCircle, GitBranch, Calendar, Hash } from 'lucide-react';

export interface WorkItemDetailProps {
  workItemId: string;
}

/**
 * WorkItemDetail component
 *
 * @param workItemId - The ID of WorkItem to display
 */
export function WorkItemDetail({ workItemId }: WorkItemDetailProps) {
  const [activeTab, setActiveTab] = useState('discussion');
  const { data: workItem, isLoading, error } = useWorkItem(workItemId);
  const { closeWorkItem, isLoading: isClosing } = useCloseWorkItem(workItemId);
  const { deleteWorkItem, isLoading: isDeleting } = useDeleteWorkItem(workItemId);

  // Worktree management - always call hook but only use when workItem is loaded
  const worktreeManagement = useWorktreeManagement({
    type: 'workitem',
    id: workItemId,
    projectId: workItem?.projectId || '',
    worktreePath: workItem?.worktreePath || null,
    branchName: workItem?.branchName || '',
  });

  const handleClose = async () => {
    if (window.confirm('Are you sure you want to close this WorkItem?')) {
      await closeWorkItem();
    }
  };

  const handleDelete = async () => {
    if (
      window.confirm('Are you sure you want to delete this WorkItem? This action cannot be undone.')
    ) {
      await deleteWorkItem();
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <Skeleton className="mb-4 h-8 w-3/4" />
          <Skeleton className="mb-2 h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <Skeleton className="mb-4 h-6 w-1/4" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <div className="flex items-start space-x-3">
          <AlertCircle className="mt-0.5 h-5 w-5 text-red-600" />
          <div>
            <h3 className="font-medium text-red-900">Error loading WorkItem</h3>
            <p className="mt-1 text-sm text-red-700">{error.message}</p>
          </div>
        </div>
      </div>
    );
  }

  // WorkItem not found
  if (!workItem) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-6">
        <div className="flex items-start space-x-3">
          <AlertCircle className="mt-0.5 h-5 w-5 text-gray-600" />
          <div>
            <h3 className="font-medium text-gray-900">WorkItem not found</h3>
            <p className="mt-1 text-sm text-gray-600">The requested WorkItem could not be found.</p>
          </div>
        </div>
      </div>
    );
  }

  // Get status type for badge
  const getStatusType = (status: string): 'success' | 'error' | 'info' | 'neutral' | 'warning' => {
    switch (status) {
      case 'open':
        return 'success';
      case 'closed':
        return 'neutral';
      default:
        return 'neutral';
    }
  };

  // Determine worktree status
  const getWorktreeStatus = (): 'present' | 'missing' | 'recreating' => {
    if (worktreeManagement.isRecreating) return 'recreating';
    return workItem?.worktreePath ? 'present' : 'missing';
  };

  return (
    <div className="space-y-6">
      {/* WorkItem Header */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex-1">
            <div className="mb-2 flex items-center space-x-2">
              <StatusBadge status={getStatusType(workItem.status)}>{workItem.status}</StatusBadge>
              <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                {workItem.type}
              </span>
            </div>
            <h1 className="text-2xl font-semibold text-gray-900">{workItem.title}</h1>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleClose}
              loading={isClosing}
              disabled={workItem.status === 'closed'}
            >
              Close
            </Button>
            <Button variant="danger" size="sm" onClick={handleDelete} loading={isDeleting}>
              Delete
            </Button>
          </div>
        </div>

        {/* WorkItem Body */}
        {workItem.body && (
          <div className="mb-4 whitespace-pre-wrap text-gray-700">{workItem.body}</div>
        )}

        {/* Worktree Status */}
        <WorktreeStatusComponent
          status={getWorktreeStatus()}
          path={workItem?.worktreePath || null}
          branchName={workItem?.branchName || ''}
          projectId={workItem?.projectId || ''}
          createdAt={workItem?.createdAt}
          updatedAt={workItem?.updatedAt}
          onRecreate={worktreeManagement.recreateWorktree}
          onRemove={worktreeManagement.removeWorktree}
          isRecreating={worktreeManagement.isRecreating}
          isRemoving={worktreeManagement.isRemoving}
          error={worktreeManagement.error?.message}
        />

        {/* WorkItem Metadata */}
        <div className="grid grid-cols-1 gap-3 border-t border-gray-200 pt-4 sm:grid-cols-2">
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <GitBranch className="h-4 w-4" />
            <span>
              <span className="font-medium">Branch:</span> {workItem.branchName}
            </span>
          </div>
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <Hash className="h-4 w-4" />
            <span>
              <span className="font-medium">Base SHA:</span>{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">
                {workItem.baseSha.slice(0, 8)}
              </code>
            </span>
          </div>
          {workItem.headSha && (
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <Hash className="h-4 w-4" />
              <span>
                <span className="font-medium">Head SHA:</span>{' '}
                <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">
                  {workItem.headSha.slice(0, 8)}
                </code>
              </span>
            </div>
          )}
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <Calendar className="h-4 w-4" />
            <span>
              <span className="font-medium">Created:</span>{' '}
              {new Date(workItem.createdAt).toLocaleString()}
            </span>
          </div>
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <Calendar className="h-4 w-4" />
            <span>
              <span className="font-medium">Updated:</span>{' '}
              {new Date(workItem.updatedAt).toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <ControlledTabs defaultValue="discussion" value={activeTab} onValueChange={setActiveTab}>
        <div className="rounded-lg border bg-white shadow-sm">
          <div className="border-b border-gray-200 px-6">
            <div className="flex space-x-8" role="tablist">
              <Tab value="discussion">Discussion</Tab>
              <Tab value="agent-config">Agent Config</Tab>
              <Tab value="pr-status">PR Status</Tab>
            </div>
          </div>

          <div className="p-6">
            <TabPanel value="discussion">
              <div className="py-12 text-center">
                <p className="text-sm text-gray-600">Discussion tab - Coming soon</p>
              </div>
            </TabPanel>
            <TabPanel value="agent-config">
              <div className="py-12 text-center">
                <p className="text-sm text-gray-600">Agent Config tab - Coming soon</p>
              </div>
            </TabPanel>
            <TabPanel value="pr-status">
              <div className="py-12 text-center">
                <p className="text-sm text-gray-600">PR Status tab - Coming soon</p>
              </div>
            </TabPanel>
          </div>
        </div>
      </ControlledTabs>
    </div>
  );
}
