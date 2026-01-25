/**
 * Dashboard Tab Component
 * Displays Work Items and Pull Requests grouped by status columns
 * - Not Running: Work Item queued or open with no active run (completed/failed/idle)
 * - Running: Work Item with agent run in running status
 * - Review: PR with status open
 * - Sync Pending: PR with status merged but no syncedCommitSha
 * - Done: PR with status closed/merged + closed Work Items
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { workItemsApi, pullRequestsApi, agentRunsApi } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { Project, WorkItem, PullRequest, AgentRun } from '@/types';
import { safeParseIso } from '@/lib/datetime';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { CreateWorkItemModal } from '@/components/workitem/CreateWorkItemModal';
import { useCreateWorkItem } from '@/hooks/useWorkItem';

const PAGE_SIZE = 20;

export interface DashboardTabProps {
  project: Project;
}

interface DashboardItem {
  id: string;
  title: string;
  type: 'workitem' | 'pr';
  createdAt: string;
  workItem?: WorkItem;
  pullRequest?: PullRequest;
}

export function DashboardTab({ project }: DashboardTabProps) {
  const navigate = useNavigate();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const { createWorkItem, isLoading: isCreating } = useCreateWorkItem();

  const handleCreateWorkItem = async (data: {
    type: 'issue' | 'feature-request';
    title: string;
    body?: string;
  }) => {
    await createWorkItem({ projectId: project.id, ...data });
    setIsCreateModalOpen(false);
  };

  // Fetch all work items for the project - standard key ['workitems', filters]
  const { data: workItemsResponse, isLoading: isLoadingWorkItems } = useQuery({
    queryKey: queryKeys.workitems({ projectId: project.id }),
    queryFn: () => workItemsApi.list(project.id, 1, 1000),
    refetchInterval: 10_000, // statuses can change externally (workflow/agent)
  });

  const workItems = workItemsResponse?.data?.data || [];

  // Fetch all pull requests for the project
  const { data: pullRequestsResponse, isLoading: isLoadingPRs } = useQuery({
    queryKey: ['pull-requests', project.id, 'all'],
    queryFn: () => pullRequestsApi.list(project.id, 1, 1000),
  });

  const pullRequests = pullRequestsResponse?.data?.data || [];

  // Fetch agent runs for all work items
  const { data: agentRunsMap } = useQuery({
    queryKey: ['workitems-agent-runs-dashboard', workItems.map((wi) => wi.id)],
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

  // Get the latest agent run status for grouping (queued | running | idle)
  const getLatestAgentRunStatus = (workItemId: string): 'queued' | 'running' | 'idle' => {
    const runs = agentRunsMap?.get(workItemId) || [];
    if (runs.length === 0) return 'idle';
    const sortedRuns = [...runs].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const latestRun = sortedRuns[0];
    if (latestRun.status === 'queued') return 'queued';
    if (latestRun.status === 'running') return 'running';
    return 'idle';
  };

  // Get actual status for card color/label (work item: queued|running|succeeded|failed|cancelled|closed; PR: open|sync pending|merged|closed)
  type ItemDisplayStatus =
    | 'queued'
    | 'running'
    | 'succeeded'
    | 'failed'
    | 'cancelled'
    | 'closed'
    | 'open'
    | 'sync-pending'
    | 'merged'
    | 'no-run';
  const getItemDisplayStatus = (item: DashboardItem): ItemDisplayStatus => {
    if (item.type === 'workitem' && item.workItem) {
      if (item.workItem.status === 'closed') return 'closed';
      const runs = agentRunsMap?.get(item.id) || [];
      if (runs.length === 0) return 'no-run';
      const sorted = [...runs].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      const status = sorted[0].status;
      if (
        status === 'queued' ||
        status === 'running' ||
        status === 'succeeded' ||
        status === 'failed' ||
        status === 'cancelled'
      )
        return status;
      return 'no-run';
    }
    if (item.type === 'pr' && item.pullRequest) {
      const pr = item.pullRequest;
      if (pr.status === 'open') return 'open';
      if (pr.status === 'merged') return pr.syncedCommitSha ? 'merged' : 'sync-pending';
      return 'closed';
    }
    return 'no-run';
  };

  // Use border-l-* so the 4px left accent gets the correct color (Tailwind applies left border color)
  const statusStyle: Record<
    ItemDisplayStatus,
    { label: string; borderColor: string; labelColor: string }
  > = {
    queued: {
      label: 'Queued',
      borderColor: 'border-l-amber-500 hover:border-l-amber-600',
      labelColor: 'text-amber-700',
    },
    running: {
      label: 'Running',
      borderColor: 'border-l-blue-400 hover:border-l-blue-600',
      labelColor: 'text-blue-700',
    },
    succeeded: {
      label: 'Succeeded',
      borderColor: 'border-l-emerald-500 hover:border-l-emerald-600',
      labelColor: 'text-emerald-700',
    },
    failed: {
      label: 'Failed',
      borderColor: 'border-l-red-500 hover:border-l-red-600',
      labelColor: 'text-red-700',
    },
    cancelled: {
      label: 'Cancelled',
      borderColor: 'border-l-gray-500 hover:border-l-gray-600',
      labelColor: 'text-gray-600',
    },
    closed: {
      label: 'Closed',
      borderColor: 'border-l-gray-500 hover:border-l-gray-600',
      labelColor: 'text-gray-600',
    },
    open: {
      label: 'Open',
      borderColor: 'border-l-purple-500 hover:border-l-purple-600',
      labelColor: 'text-purple-700',
    },
    'sync-pending': {
      label: 'Sync Pending',
      borderColor: 'border-l-orange-500 hover:border-l-orange-600',
      labelColor: 'text-orange-700',
    },
    merged: {
      label: 'Merged',
      borderColor: 'border-l-emerald-500 hover:border-l-emerald-600',
      labelColor: 'text-emerald-700',
    },
    'no-run': {
      label: 'No run',
      borderColor: 'border-l-slate-400 hover:border-l-slate-500',
      labelColor: 'text-slate-600',
    },
  };

  // Group items by status
  const groupedItems = useMemo(() => {
    const inQueue: DashboardItem[] = [];
    const inProgress: DashboardItem[] = [];
    const inReview: DashboardItem[] = [];
    const waitingSync: DashboardItem[] = [];
    const closed: DashboardItem[] = [];

    // Process work items – track every work item (open and closed)
    workItems.forEach((workItem: WorkItem) => {
      const item: DashboardItem = {
        id: workItem.id,
        title: workItem.title,
        type: 'workitem',
        createdAt: workItem.createdAt,
        workItem,
      };

      if (workItem.status === 'closed') {
        closed.push(item);
        return;
      }

      const agentRunStatus = getLatestAgentRunStatus(workItem.id);
      if (agentRunStatus === 'running') {
        inProgress.push(item);
      } else {
        // queued or idle (completed/failed/cancelled/no run) → Not Running column
        inQueue.push(item);
      }
    });

    // Process pull requests
    pullRequests.forEach((pr: PullRequest) => {
      const item: DashboardItem = {
        id: pr.id,
        title: pr.title,
        type: 'pr',
        createdAt: pr.createdAt,
        pullRequest: pr,
      };

      if (pr.status === 'open') {
        inReview.push(item);
      } else if (pr.status === 'merged') {
        if (pr.syncedCommitSha) {
          closed.push(item);
        } else {
          waitingSync.push(item);
        }
      } else if (pr.status === 'closed') {
        closed.push(item);
      }
    });

    return { inQueue, inProgress, inReview, waitingSync, closed };
  }, [workItems, pullRequests, agentRunsMap]);

  // Combined list sorted by createdAt desc for pagination (20 per page)
  const { totalItems, paginatedColumnItems, totalPages } = useMemo(() => {
    const all = [
      ...groupedItems.inQueue,
      ...groupedItems.inProgress,
      ...groupedItems.inReview,
      ...groupedItems.waitingSync,
      ...groupedItems.closed,
    ];
    const sorted = [...all].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const total = sorted.length;
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = sorted.slice(start, start + PAGE_SIZE);
    const pageIds = new Set(pageItems.map((i) => i.id));
    return {
      totalItems: total,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      paginatedColumnItems: [
        groupedItems.inQueue.filter((i) => pageIds.has(i.id)),
        groupedItems.inProgress.filter((i) => pageIds.has(i.id)),
        groupedItems.inReview.filter((i) => pageIds.has(i.id)),
        groupedItems.waitingSync.filter((i) => pageIds.has(i.id)),
        groupedItems.closed.filter((i) => pageIds.has(i.id)),
      ],
    };
  }, [groupedItems, currentPage]);

  const handleItemClick = (item: DashboardItem) => {
    if (item.type === 'workitem') {
      navigate({
        to: '/projects/$projectName/workitems',
        params: { projectName: project.name },
        search: { status: 'all', type: 'all', workItemId: item.id },
      });
    } else {
      navigate({
        to: '/projects/$projectName/pullrequests',
        params: { projectName: project.name },
        search: { status: 'all', prId: item.id },
      });
    }
  };

  // Format date with time in HH:MM:SS format
  const formatDateWithTime = (dateStr: string): string => {
    const date = safeParseIso(dateStr);
    if (!date) return '—';

    const datePart = new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
    }).format(date);

    const timePart = new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date);

    return `${datePart} ${timePart}`;
  };

  const renderItem = (item: DashboardItem) => {
    const displayStatus = getItemDisplayStatus(item);
    const style = statusStyle[displayStatus];
    return (
      <div
        key={item.id}
        onClick={() => handleItemClick(item)}
        className={`flex min-h-[80px] cursor-pointer flex-col rounded-lg border border-l-4 border-gray-200 bg-white p-3 shadow-sm transition-all hover:shadow-md ${style.borderColor}`}
      >
        <div className="flex-1 space-y-1">
          <h4 className="line-clamp-3 text-xs font-medium text-gray-900">{item.title}</h4>
          <div className="mt-auto flex items-end justify-between gap-2 text-xs text-gray-500">
            <span>{formatDateWithTime(item.createdAt)}</span>
            <span className={`shrink-0 font-medium ${style.labelColor}`}>{style.label}</span>
          </div>
        </div>
      </div>
    );
  };

  type ColumnConfig = { title: string; headerBg: string };
  const columns: ColumnConfig[] = [
    { title: 'Not Running', headerBg: 'bg-amber-50 border border-amber-200' },
    { title: 'Running', headerBg: 'bg-blue-50 border border-blue-200' },
    { title: 'Review', headerBg: 'bg-purple-50 border border-purple-200' },
    { title: 'Sync Pending', headerBg: 'bg-orange-50 border border-orange-200' },
    { title: 'Done', headerBg: 'bg-gray-50 border border-gray-200' },
  ];

  const columnItems = paginatedColumnItems;
  const columnTotals = [
    groupedItems.inQueue.length,
    groupedItems.inProgress.length,
    groupedItems.inReview.length,
    groupedItems.waitingSync.length,
    groupedItems.closed.length,
  ];

  const renderColumn = (config: ColumnConfig, items: DashboardItem[], colIndex: number) => (
    <div className="flex flex-col">
      <div className={`mb-3 rounded-lg ${config.headerBg} px-3 py-2`}>
        <h3 className="text-sm font-semibold text-gray-900">{config.title}</h3>
        <p className="mt-1 text-xs text-gray-600">
          {columnTotals[colIndex]} total
          {columnTotals[colIndex] !== items.length ? ` · ${items.length} on this page` : ''}
        </p>
      </div>
      <div className="min-h-[200px] space-y-2">
        {items.length > 0 ? (
          items.map((item) => renderItem(item))
        ) : (
          <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
            <p className="text-sm text-gray-500">No items</p>
          </div>
        )}
      </div>
    </div>
  );

  if (isLoadingWorkItems || isLoadingPRs) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
          <p className="mt-2 text-sm text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Dashboard</h2>
          <p className="mt-1 text-sm text-gray-600">
            Overview of Work Items and Pull Requests by status
          </p>
        </div>
        <Button variant="primary" onClick={() => setIsCreateModalOpen(true)} className="shrink-0">
          Create Work Item
        </Button>
      </div>

      <CreateWorkItemModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        projectId={project.id}
        onSubmit={handleCreateWorkItem}
        isLoading={isCreating}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
        {columns.map((config, i) => renderColumn(config, columnItems[i], i))}
      </div>

      {totalItems > PAGE_SIZE && (
        <div className="mt-6">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            totalItems={totalItems}
            itemsPerPage={PAGE_SIZE}
          />
        </div>
      )}
    </div>
  );
}
