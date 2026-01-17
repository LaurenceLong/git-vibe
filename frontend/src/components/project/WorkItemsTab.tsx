/**
 * WorkItems Tab Component
 * Lists and filters WorkItems (Issues & Feature Requests)
 * WorkItems are task definitions only - Changesets handle workspaces
 * Items are clickable and navigate to detail view
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { workItemsApi, agentRunsApi } from '@/lib/api';
import { Project, WorkItem, WorkItemType, WorkItemStatus, AgentRun, AgentRunStatus } from '@/types';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { CreateWorkItemModal } from '@/components/workitem/CreateWorkItemModal';
import { useCreateWorkItem } from '@/hooks/useWorkItem';
import { WorkItemDetail } from '@/components/workitem/WorkItemDetail';
import { ArrowLeft, Terminal, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

/**
 * StatusBadge component for displaying agent run status
 */
function AgentRunStatusBadge({ status }: { status: AgentRunStatus }) {
  const statusConfig: Record<
    AgentRunStatus,
    { variant: 'success' | 'warning' | 'destructive' | 'info' | 'neutral'; label: string }
  > = {
    running: { variant: 'info', label: 'Running' },
    queued: { variant: 'neutral', label: 'Queued' },
    failed: { variant: 'destructive', label: 'Failed' },
    succeeded: { variant: 'success', label: 'Completed' },
    cancelled: { variant: 'neutral', label: 'Canceled' },
  };

  const config = statusConfig[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

/**
 * LogPreview component for displaying log previews
 */
function LogPreview({
  agentRunId,
  isExpanded,
  onToggle: _onToggle,
}: {
  agentRunId: string;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const {
    data: logs,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['agent-run-preview', agentRunId],
    queryFn: async () => {
      const [stdout, stderr] = await Promise.all([
        agentRunsApi.getStdoutTail(agentRunId, 5),
        agentRunsApi.getStderrTail(agentRunId, 5),
      ]);
      return { stdout, stderr };
    },
    enabled: isExpanded, // Only fetch when expanded
    staleTime: 5000, // Cache for 5 seconds
  });

  if (!isExpanded) {
    return null;
  }

  return (
    <div className="mt-3 rounded-md bg-gray-900 p-3">
      {isLoading ? (
        <div className="flex items-center space-x-2 text-sm text-gray-400">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-600 border-t-blue-400" />
          <span>Loading preview...</span>
        </div>
      ) : error ? (
        <div className="flex items-center space-x-2 text-sm text-red-400">
          <AlertCircle className="h-4 w-4" />
          <span>Unable to load preview</span>
        </div>
      ) : (
        <div className="space-y-2">
          {logs?.stdout && (
            <div>
              <div className="mb-1 flex items-center space-x-2">
                <Terminal className="h-3 w-3 text-green-400" />
                <span className="text-xs font-medium text-gray-400">Stdout</span>
              </div>
              <pre className="overflow-x-auto text-xs text-gray-300">
                {logs.stdout || <span className="text-gray-500">No output</span>}
              </pre>
            </div>
          )}
          {logs?.stderr && (
            <div className="mt-2">
              <div className="mb-1 flex items-center space-x-2">
                <Terminal className="h-3 w-3 text-red-400" />
                <span className="text-xs font-medium text-gray-400">Stderr</span>
              </div>
              <pre className="overflow-x-auto text-xs text-red-300">{logs.stderr}</pre>
            </div>
          )}
          {!logs?.stdout && !logs?.stderr && (
            <p className="text-xs text-gray-500">No logs available</p>
          )}
        </div>
      )}
    </div>
  );
}

export interface WorkItemsTabProps {
  project: Project;
  initialStatus?: WorkItemStatus | 'all';
  initialType?: WorkItemType | 'all';
  initialWorkItemId?: string | null;
}

export function WorkItemsTab({
  project,
  initialStatus = 'all',
  initialType = 'all',
  initialWorkItemId = null,
}: WorkItemsTabProps) {
  const [statusFilter, setStatusFilter] = useState<WorkItemStatus | 'all'>(initialStatus);
  const [typeFilter, setTypeFilter] = useState<WorkItemType | 'all'>(initialType);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedWorkItemId, setSelectedWorkItemId] = useState<string | null>(initialWorkItemId);
  const itemsPerPage = 10;

  const { data: response, isLoading } = useQuery({
    queryKey: ['workitems', project.id, currentPage, itemsPerPage],
    queryFn: () => workItemsApi.list(project.id, currentPage, itemsPerPage).then((res) => res.data),
  });

  const workItems = response?.data || [];
  const pagination = response?.pagination;

  // Track expanded work items for log previews
  const [expandedWorkItems, setExpandedWorkItems] = useState<Set<string>>(new Set());

  // Fetch agent runs for all work items
  const { data: agentRunsMap } = useQuery({
    queryKey: ['workitems-agent-runs', workItems.map((wi) => wi.id)],
    queryFn: async () => {
      const runsMap = new Map<string, AgentRun[]>();
      await Promise.all(
        workItems.map(async (workItem) => {
          try {
            const response = await agentRunsApi.listByWorkItem(workItem.id);
            runsMap.set(workItem.id, response.data);
          } catch (error) {
            console.error(`Failed to fetch agent runs for work item ${workItem.id}:`, error);
            runsMap.set(workItem.id, []);
          }
        })
      );
      return runsMap;
    },
    enabled: workItems.length > 0,
  });

  // Get the latest agent run for a work item
  const getLatestAgentRun = (workItemId: string): AgentRun | null => {
    const runs = agentRunsMap?.get(workItemId) || [];
    if (runs.length === 0) return null;
    // Sort by createdAt descending to get the most recent run
    return runs.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];
  };

  const toggleExpanded = (workItemId: string) => {
    setExpandedWorkItems((prev) => {
      const next = new Set(prev);
      if (next.has(workItemId)) {
        next.delete(workItemId);
      } else {
        next.add(workItemId);
      }
      return next;
    });
  };

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
        <WorkItemDetail workItemId={selectedWorkItemId} onDeleteSuccess={handleBackToList} />
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
          {filteredWorkItems.map((workItem: WorkItem) => {
            const latestAgentRun = getLatestAgentRun(workItem.id);
            const isExpanded = expandedWorkItems.has(workItem.id);

            return (
              <div
                key={workItem.id}
                className="rounded-lg border transition-colors hover:border-blue-300 hover:bg-gray-50"
              >
                <div
                  onClick={() => handleWorkItemClick(workItem.id)}
                  className="cursor-pointer p-4"
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
                        {latestAgentRun && <AgentRunStatusBadge status={latestAgentRun.status} />}
                      </div>
                      <div className="mt-2 text-sm text-gray-600">
                        Created {new Date(workItem.createdAt).toLocaleDateString()}
                        {latestAgentRun && (
                          <span className="ml-3">
                            Agent run: {new Date(latestAgentRun.createdAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="ml-4 flex items-center space-x-2">
                      {latestAgentRun && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpanded(workItem.id);
                          }}
                          className="flex items-center space-x-1 rounded-md px-2 py-1 text-sm font-medium text-gray-600 hover:bg-gray-100"
                          title="Toggle log preview"
                        >
                          <Terminal className="h-4 w-4" />
                          <span>Logs</span>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </button>
                      )}
                      <div className="text-gray-400">
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
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
                </div>
                {latestAgentRun && (
                  <LogPreview
                    agentRunId={latestAgentRun.id}
                    isExpanded={isExpanded}
                    onToggle={() => toggleExpanded(workItem.id)}
                  />
                )}
              </div>
            );
          })}
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
