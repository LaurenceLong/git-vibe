import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { WorkflowListItemSchema, createPaginatedResponseSchema } from 'git-vibe-shared';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle, Trash2, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { useConfirmModal } from '@/components/ConfirmModal';
import { formatDateTime } from '@/lib/datetime';
import { getApiClient } from '@/lib/api';

function getWorkflowsApi() {
  const api = getApiClient();
  return {
    list: async (page?: number, limit?: number) => {
      return api.get('/workflows', { params: { page, limit } });
    },
    get: async (id: string) => {
      return api.get(`/workflows/${id}`);
    },
    delete: (id: string) => api.delete(`/workflows/${id}`),
    execute: async (workflowId: string, workItemId: string) => {
      return api.post(`/workflows/${workflowId}/execute`, { workItemId });
    },
    getRuns: async (workflowId: string, workItemId?: string) => {
      return api.get(`/workflows/${workflowId}/runs`, { params: { workItemId } });
    },
    getRunSteps: async (runId: string) => {
      return api.get(`/workflow-runs/${runId}/steps`);
    },
  };
}

export function WorkflowList() {
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [targetWorkItemId, setTargetWorkItemId] = useState<string>('');
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const api = getWorkflowsApi();
  const { confirm } = useConfirmModal();

  const {
    data: workflowsResponse,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['workflows'],
    queryFn: async () => {
      const response = await api.list(1, 50);
      const parsed = createPaginatedResponseSchema(WorkflowListItemSchema).parse(response.data);
      // Sort by createdAt descending (newest first)
      if (parsed.data) {
        parsed.data = [...parsed.data].sort((a, b) => {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
      }
      return parsed;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      setSelectedWorkflowId(null);
    },
  });

  const handleDelete = async (id: string) => {
    if (
      await confirm({
        message: 'Are you sure you want to delete this workflow?',
        variant: 'danger',
        confirmLabel: 'Delete',
      })
    ) {
      deleteMutation.mutate(id);
    }
  };

  const handleExecute = async (workflowId: string) => {
    if (targetWorkItemId) {
      await api.execute(workflowId, targetWorkItemId);
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border border-gray-700 bg-gray-900 p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
              <Skeleton className="h-10 w-10" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-800 bg-red-900/20 p-8">
        <p className="text-center text-red-400">Failed to load workflows</p>
      </div>
    );
  }

  if (!workflowsResponse?.data || workflowsResponse.data.length === 0) {
    return (
      <EmptyState
        icon={<Plus className="h-12 w-12 text-gray-500" />}
        title="No workflows found"
        description="Create a workflow to get started"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-100">Workflows</h2>
        <div className="flex space-x-2">
          <div className="flex items-center space-x-2 text-sm">
            <span className="text-gray-400">Target WorkItem:</span>
            <input
              type="text"
              value={targetWorkItemId}
              onChange={(e: any) => setTargetWorkItemId(e.target.value)}
              placeholder="work-item-id"
              className="rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <button
            onClick={() => selectedWorkflowId && handleExecute(selectedWorkflowId)}
            disabled={!targetWorkItemId || !selectedWorkflowId}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Execute
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {workflowsResponse.data.map((w: any) => (
          <WorkflowCard
            key={w.id}
            workflow={w}
            isSelected={selectedWorkflowId === w.id}
            onSelect={() => setSelectedWorkflowId(w.id)}
            onDelete={() => handleDelete(w.id)}
            onToggleRuns={() => setExpandedRunId(expandedRunId === w.id ? null : w.id)}
            isExpanded={expandedRunId === w.id}
          />
        ))}
      </div>
    </div>
  );
}

interface WorkflowCardProps {
  workflow: any;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onToggleRuns: () => void;
  isExpanded: boolean;
}

function WorkflowCard({
  workflow,
  isSelected,
  onSelect,
  onDelete,
  onToggleRuns,
  isExpanded,
}: WorkflowCardProps) {
  const workflowDef = workflow.definition?.workflow || {};
  const isDefault = workflow.isDefault;

  return (
    <div>
      <div
        className={`cursor-pointer rounded-lg border transition-all ${isSelected ? 'border-blue-500 bg-blue-900/20' : 'border-gray-700 bg-gray-900'}`}
        onClick={onSelect}
      >
        <div className="flex items-start justify-between p-4">
          <div className="flex-1 space-y-2">
            <div className="flex items-center space-x-2">
              <h3 className="text-lg font-semibold text-gray-100">
                {workflowDef.name || workflow.name}
              </h3>
              {isDefault && (
                <span className="inline-flex items-center rounded-full bg-blue-600 px-2 py-1 text-xs font-medium text-white">
                  <CheckCircle className="mr-1 h-3 w-3" />
                  Default
                </span>
              )}
            </div>

            <p className="text-sm text-gray-400">
              {workflowDef.description || workflow.description}
            </p>

            <div className="flex items-center space-x-4 text-xs text-gray-500">
              <span>{workflowDef.backbone?.length || 0} backbone nodes</span>
              <span>{workflowDef.slots?.length || 0} slots</span>
              <span>{workflowDef.extensions?.nodes?.length || 0} extensions</span>
              <span className="text-gray-600">
                Updated {formatDateTime(new Date(workflow.updatedAt))}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {!isDefault && (
              <button
                onClick={(e: any) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="rounded p-1 text-gray-400 hover:text-gray-200 focus:outline-none"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button
              className="rounded p-1 text-gray-400 hover:text-gray-200 focus:outline-none"
              onClick={(e: any) => {
                e.stopPropagation();
                onToggleRuns();
              }}
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      <WorkflowRuns workflowId={workflow.id} isExpanded={isExpanded} />
    </div>
  );
}

interface WorkflowRunsProps {
  workflowId: string;
  isExpanded: boolean;
}

function WorkflowRuns({ workflowId, isExpanded }: WorkflowRunsProps) {
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const api = getWorkflowsApi();

  const { data: runsResponse, isLoading } = useQuery({
    queryKey: ['workflow-runs', workflowId],
    queryFn: async () => {
      const response = await api.getRuns(workflowId);
      return response.data;
    },
    enabled: isExpanded,
  });

  const { data: stepsResponse, isLoading: isStepsLoading } = useQuery({
    queryKey: ['workflow-run-steps', expandedStepId],
    queryFn: async () => {
      if (!expandedStepId) return [];
      const response = await api.getRunSteps(expandedStepId);
      return response.data;
    },
    enabled: !!expandedStepId,
  });

  if (!isExpanded) {
    return null;
  }

  return (
    <div className="ml-4 rounded border border-gray-700 bg-gray-800/50 p-4">
      <h4 className="mb-3 text-sm font-semibold text-gray-300">Recent Runs</h4>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="flex items-center space-x-3">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      ) : runsResponse && runsResponse.length > 0 ? (
        <div className="space-y-2">
          {[...runsResponse]
            .sort((a, b) => {
              // Sort by createdAt descending (newest first)
              return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            })
            .map((run: any) => (
              <div
                key={run.id}
                className="flex items-center justify-between rounded border border-gray-600 bg-gray-800 px-3 py-2"
              >
                <div className="flex items-center space-x-3">
                  <span className="text-xs text-gray-400">
                    {formatDateTime(new Date(run.createdAt))}
                  </span>
                  <StatusBadge status={run.status} />
                </div>
                <button
                  className="rounded p-1 text-gray-400 hover:text-gray-200 focus:outline-none"
                  onClick={() => setExpandedStepId(expandedStepId === run.id ? null : run.id)}
                >
                  {expandedStepId === run.id ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </button>
              </div>
            ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">No runs yet</p>
      )}

      {expandedStepId && (
        <div className="mt-4 rounded border border-gray-600 bg-gray-800 p-4">
          <h5 className="mb-3 text-xs font-semibold text-gray-400">Step Details</h5>

          {isStepsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton className="h-8 w-40" />
                  <Skeleton className="h-6 w-16" />
                </div>
              ))}
            </div>
          ) : stepsResponse ? (
            <div className="space-y-2">
              {stepsResponse.map((step: any) => (
                <div key={step.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-3">
                    <span className="text-gray-300">{step.nodeId}</span>
                    <StatusBadge status={step.status} />
                  </div>
                  <span className="text-gray-500">
                    {step.startedAt ? formatDateTime(new Date(step.startedAt)) : 'Not started'}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<
    string,
    { variant: 'success' | 'warning' | 'destructive' | 'info' | 'neutral'; label: string }
  > = {
    pending: { variant: 'neutral', label: 'Pending' },
    running: { variant: 'info', label: 'Running' },
    succeeded: { variant: 'success', label: 'Succeeded' },
    failed: { variant: 'destructive', label: 'Failed' },
    blocked: { variant: 'warning', label: 'Blocked' },
    skipped: { variant: 'neutral', label: 'Skipped' },
  };

  const cfg = config[status] || { variant: 'neutral', label: status };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getVariantClasses(cfg.variant)}`}
    >
      {cfg.label}
    </span>
  );
}

function getVariantClasses(
  variant: 'success' | 'warning' | 'destructive' | 'info' | 'neutral'
): string {
  const classes = {
    success: 'bg-green-600 text-white',
    warning: 'bg-yellow-600 text-white',
    destructive: 'bg-red-600 text-white',
    info: 'bg-blue-600 text-white',
    neutral: 'bg-gray-600 text-white',
  };
  return classes[variant];
}
