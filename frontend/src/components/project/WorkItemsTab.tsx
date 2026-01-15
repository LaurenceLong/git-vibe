/**
 * WorkItems Tab Component
 * Lists and filters WorkItems (Issues & Feature Requests)
 * WorkItems are task definitions only - Changesets handle workspaces
 * Items are clickable and navigate to detail view
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { workItemsApi } from '@/lib/api';
import { Project, WorkItem, WorkItemType, WorkItemStatus } from '@/types';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { CreateWorkItemModal } from '@/components/workitem/CreateWorkItemModal';
import { useCreateWorkItem } from '@/hooks/useWorkItem';
import { WorkItemDetail } from '@/components/workitem/WorkItemDetail';
import { ArrowLeft } from 'lucide-react';

export interface WorkItemsTabProps {
  project: Project;
}

export function WorkItemsTab({ project }: WorkItemsTabProps) {
  const [statusFilter, setStatusFilter] = useState<WorkItemStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<WorkItemType | 'all'>('all');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedWorkItemId, setSelectedWorkItemId] = useState<string | null>(null);
  const itemsPerPage = 10;

  const { data: response, isLoading } = useQuery({
    queryKey: ['workitems', project.id, currentPage, itemsPerPage],
    queryFn: () => workItemsApi.list(project.id, currentPage, itemsPerPage).then((res) => res.data),
  });

  const workItems = response?.data || [];
  const pagination = response?.pagination;

  const { createWorkItem, isLoading: isCreating } = useCreateWorkItem();

  const handleCreateWorkItem = async (data: {
    type: 'issue' | 'feature-request';
    title: string;
    body?: string;
  }) => {
    await createWorkItem({ projectId: project.id, ...data });
    // Stay on the workitems tab after creation
    setIsCreateModalOpen(false);
  };

  const handleWorkItemClick = (workItemId: string) => {
    setSelectedWorkItemId(workItemId);
  };

  const handleBackToList = () => {
    setSelectedWorkItemId(null);
  };

  const filteredWorkItems = workItems.filter((wi: WorkItem) => {
    if (statusFilter !== 'all' && wi.status !== statusFilter) return false;
    if (typeFilter !== 'all' && wi.type !== typeFilter) return false;
    return true;
  });

  // If a work item is selected, show the detail view
  if (selectedWorkItemId) {
    return (
      <div className="space-y-4">
        <button
          onClick={handleBackToList}
          className="flex items-center space-x-2 text-sm text-blue-600 transition-colors hover:text-blue-800"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Work Items</span>
        </button>
        <WorkItemDetail workItemId={selectedWorkItemId} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with filters and create button */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center space-x-4">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as WorkItemStatus | 'all')}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as WorkItemType | 'all')}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Types</option>
            <option value="issue">Issues</option>
            <option value="feature-request">Feature Requests</option>
          </select>
        </div>

        {/* Create WorkItem Button */}
        <Button variant="primary" onClick={() => setIsCreateModalOpen(true)}>
          Create Work Item
        </Button>

        {/* Create WorkItem Modal */}
        <CreateWorkItemModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          projectId={project.id}
          onSubmit={handleCreateWorkItem}
          isLoading={isCreating}
        />
      </div>

      {/* WorkItems List */}
      {isLoading ? (
        <div className="py-12 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
          <p className="mt-2 text-sm text-gray-600">Loading work items...</p>
        </div>
      ) : filteredWorkItems.length > 0 ? (
        <div className="space-y-3">
          {filteredWorkItems.map((workItem: WorkItem) => (
            <div
              key={workItem.id}
              onClick={() => handleWorkItemClick(workItem.id)}
              className="block cursor-pointer rounded-lg border p-4 transition-colors hover:border-blue-300 hover:bg-gray-50"
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-medium text-gray-900 hover:text-blue-600">
                    {workItem.title}
                  </h3>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant={workItem.type === 'issue' ? 'info' : 'warning'}>
                      {workItem.type}
                    </Badge>
                    <Badge variant={workItem.status === 'open' ? 'success' : 'neutral'}>
                      {workItem.status}
                    </Badge>
                  </div>
                  <div className="mt-2 text-sm text-gray-600">
                    Created {new Date(workItem.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="ml-4 text-gray-400">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No work items found"
          description={
            statusFilter !== 'all' || typeFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'Create your first work item to get started'
          }
          action={
            statusFilter === 'all' && typeFilter === 'all' ? (
              <Button variant="primary" onClick={() => setIsCreateModalOpen(true)}>
                Create Work Item
              </Button>
            ) : undefined
          }
        />
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="mt-6">
          <Pagination
            currentPage={pagination.page}
            totalPages={pagination.totalPages}
            onPageChange={setCurrentPage}
            totalItems={pagination.total}
            itemsPerPage={pagination.limit}
          />
        </div>
      )}
    </div>
  );
}
