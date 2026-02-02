import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { workflowsApi, workItemsApi } from '@/lib/api';
import { formatDateTime, formatDuration } from '@/lib/datetime';
import { CheckCircle2, XCircle, Clock, Loader2, Ban, ChevronRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { StepStatus } from 'git-vibe-shared';

export interface WorkflowRunsListProps {
  workflowId: string;
  onRunSelect?: (runId: string) => void;
  searchQuery?: string;
  statusFilter?: StepStatus | 'all';
}

interface WorkflowRun {
  id: string;
  workflowId: string;
  workItemId: string;
  status: StepStatus;
  currentStepId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export function WorkflowRunsList({
  workflowId,
  onRunSelect,
  searchQuery = '',
  statusFilter = 'all',
}: WorkflowRunsListProps) {
  const { data: runsResponse, isLoading } = useQuery({
    queryKey: ['workflow-runs', workflowId],
    queryFn: async () => {
      const response = await workflowsApi.getRuns(workflowId);
      return response.data.data as WorkflowRun[];
    },
  });

  // Fetch work items for runs to get titles/branches
  const workItemIds = useMemo(
    () => Array.from(new Set((runsResponse || []).map((r) => r.workItemId))),
    [runsResponse]
  );

  const { data: workItems } = useQuery({
    queryKey: ['work-items-batch', workItemIds],
    queryFn: async () => {
      const items = await Promise.all(
        workItemIds.map((id) => workItemsApi.get(id).catch(() => null))
      );
      return items.filter((item) => item !== null);
    },
    enabled: workItemIds.length > 0,
  });

  const workItemsMap = useMemo(() => {
    const map = new Map<string, any>();
    workItems?.forEach((item) => {
      if (item?.data) {
        map.set(item.data.id, item.data);
      }
    });
    return map;
  }, [workItems]);

  const filteredRuns = useMemo(() => {
    if (!runsResponse) return [];

    const filtered = runsResponse.filter((run) => {
      if (statusFilter !== 'all' && run.status !== statusFilter) return false;
      if (searchQuery) {
        const workItem = workItemsMap.get(run.workItemId);
        const searchLower = searchQuery.toLowerCase();
        if (
          !run.id.toLowerCase().includes(searchLower) &&
          !(workItem?.title?.toLowerCase().includes(searchLower) ?? false)
        ) {
          return false;
        }
      }
      // TODO: Filter by branch, event, actor when that data is available
      return true;
    });

    // Sort by createdAt descending (newest first)
    return filtered.sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [runsResponse, statusFilter, searchQuery, workItemsMap]);

  const getStatusIcon = (status: StepStatus) => {
    switch (status) {
      case 'succeeded':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'running':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-gray-500" />;
      case 'blocked':
        return <Ban className="h-4 w-4 text-yellow-600" />;
      case 'skipped':
        return <Clock className="h-4 w-4 text-gray-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: StepStatus) => {
    switch (status) {
      case 'succeeded':
        return 'text-green-600';
      case 'failed':
        return 'text-red-600';
      case 'running':
        return 'text-blue-600';
      case 'pending':
        return 'text-gray-500';
      case 'blocked':
        return 'text-yellow-600';
      case 'skipped':
        return 'text-gray-500';
      default:
        return 'text-gray-500';
    }
  };

  const calculateDuration = (run: WorkflowRun): string | null => {
    if (!run.startedAt) return null;
    return formatDuration(run.startedAt, run.finishedAt);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Runs List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="mt-2 h-4 w-1/2" />
              </div>
            ))}
          </div>
        ) : filteredRuns.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-gray-500">
            No workflow runs found
          </div>
        ) : (
          <div className="space-y-2">
            {filteredRuns.map((run) => {
              const workItem = workItemsMap.get(run.workItemId);
              const duration = calculateDuration(run);

              return (
                <div
                  key={run.id}
                  onClick={() => onRunSelect?.(run.id)}
                  className="cursor-pointer rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition hover:border-gray-300 hover:bg-gray-50"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(run.status)}
                        <span className={`text-sm font-medium ${getStatusColor(run.status)}`}>
                          {run.status}
                        </span>
                        {workItem && (
                          <span className="text-sm text-gray-700">{workItem.title}</span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-4 text-xs text-gray-500">
                        <span>Run #{run.id.slice(0, 8)}</span>
                        {workItem?.headBranch && (
                          <span className="text-gray-600">Branch: {workItem.headBranch}</span>
                        )}
                        {run.startedAt && (
                          <span className="text-gray-600">
                            Started: {formatDateTime(new Date(run.startedAt))}
                          </span>
                        )}
                        {duration && <span className="text-gray-600">Duration: {duration}</span>}
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
