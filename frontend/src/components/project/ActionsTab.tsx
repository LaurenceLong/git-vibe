import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  WorkflowListItemSchema,
  createPaginatedResponseSchema,
  type Workflow,
  type StepStatus,
} from 'git-vibe-shared';
import { Project } from '@/types';
import { getApiClient } from '@/lib/api';
import { WorkflowRunsList } from '@/components/workflow/WorkflowRunsList';
import { RunDetailsView } from '@/components/workflow/RunDetailsView';
import { WorkflowConfigEditor } from '@/components/workflow/WorkflowConfigEditor';
import { CheckCircle, Clock, FileCode } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

export type ViewMode = 'runs' | 'run-details' | 'config';

export interface ActionsTabProps {
  project: Project;
  initialWorkflowId?: string | null;
  initialRunId?: string | null;
  initialView?: ViewMode;
  onSelectionChange?: (state: {
    workflowId: string | null;
    runId: string | null;
    viewMode: ViewMode;
  }) => void;
}

export function ActionsTab({
  project,
  initialWorkflowId = null,
  initialRunId = null,
  initialView = 'runs',
  onSelectionChange,
}: ActionsTabProps) {
  const api = getApiClient();
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(initialWorkflowId);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(initialRunId);
  const [viewMode, setViewMode] = useState<ViewMode>(initialView);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StepStatus | 'all'>('all');

  const { data: workflowsResponse, isLoading } = useQuery({
    queryKey: ['workflows', project.id],
    queryFn: async () => {
      const response = await api.get('/workflows', {
        params: { projectId: project.id, page: 1, limit: 50 },
      });
      return createPaginatedResponseSchema(WorkflowListItemSchema).parse(response.data);
    },
  });

  const workflows = workflowsResponse?.data ?? [];

  // Sync internal state with external URL-driven state
  useEffect(() => {
    setSelectedWorkflowId(initialWorkflowId);
  }, [initialWorkflowId]);

  useEffect(() => {
    setSelectedRunId(initialRunId);
  }, [initialRunId]);

  useEffect(() => {
    setViewMode(initialView);
  }, [initialView]);

  const { data: selectedWorkflowData } = useQuery({
    queryKey: ['workflow', selectedWorkflowId],
    queryFn: async () => {
      if (!selectedWorkflowId) return null;
      const response = await api.get(`/workflows/${selectedWorkflowId}`);
      return response.data.data;
    },
    enabled: !!selectedWorkflowId,
  });

  const selectedWorkflow = useMemo(() => {
    if (!selectedWorkflowData) return null;
    return selectedWorkflowData.definition as Workflow | null;
  }, [selectedWorkflowData]);

  useEffect(() => {
    if (!selectedWorkflowId && workflows.length > 0) {
      const firstId = workflows[0]!.id;
      setSelectedWorkflowId(firstId);
      onSelectionChange?.({ workflowId: firstId, runId: null, viewMode: 'runs' });
    }
  }, [selectedWorkflowId, workflows, onSelectionChange]);

  const handleRunSelect = (runId: string) => {
    setSelectedRunId(runId);
    setViewMode('run-details');
    onSelectionChange?.({
      workflowId: selectedWorkflowId,
      runId,
      viewMode: 'run-details',
    });
  };

  const handleBackToRuns = () => {
    setSelectedRunId(null);
    setViewMode('runs');
    onSelectionChange?.({
      workflowId: selectedWorkflowId,
      runId: null,
      viewMode: 'runs',
    });
  };

  const handleShowConfig = () => {
    setViewMode('config');
    onSelectionChange?.({
      workflowId: selectedWorkflowId,
      runId: selectedRunId,
      viewMode: 'config',
    });
  };

  const handleCloseConfig = () => {
    setViewMode('runs');
    onSelectionChange?.({
      workflowId: selectedWorkflowId,
      runId: selectedRunId,
      viewMode: 'runs',
    });
  };

  const getLastRunTime = (_workflowId: string): string | null => {
    // TODO: Fetch last run time from API when available
    return null;
  };

  const getWorkflowStatus = (_workflow: any): 'active' | 'inactive' => {
    // TODO: Determine status based on runs or other criteria
    return 'active';
  };

  return (
    <div className="flex h-[calc(100vh-200px)] gap-4">
      {/* Left Sidebar: Workflow List */}
      <div className="w-64 flex-shrink-0 rounded-lg border border-gray-300 bg-white shadow-sm">
        <div className="border-b border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-900">All workflows</h2>
        </div>
        <div className="h-[calc(100vh-280px)] overflow-y-auto p-2">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded border border-gray-200 bg-gray-50 p-3">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="mt-2 h-4 w-1/2" />
                </div>
              ))}
            </div>
          ) : workflows.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-500">No workflows found</div>
          ) : (
            <div className="space-y-2">
              {workflows.map((w) => {
                const isSelected = selectedWorkflowId === w.id;
                const status = getWorkflowStatus(w);
                const lastRunTime = getLastRunTime(w.id);

                return (
                  <button
                    key={w.id}
                    onClick={() => {
                      setSelectedWorkflowId(w.id);
                      setViewMode('runs');
                      setSelectedRunId(null);
                      onSelectionChange?.({
                        workflowId: w.id,
                        runId: null,
                        viewMode: 'runs',
                      });
                    }}
                    className={`w-full rounded border px-3 py-2 text-left transition ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                    }`}
                    title={w.name}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div
                            className={`h-2 w-2 flex-shrink-0 rounded-full ${
                              status === 'active' ? 'bg-green-500' : 'bg-gray-400'
                            }`}
                          />
                          <div className="truncate text-sm font-medium text-gray-900">{w.name}</div>
                        </div>
                        {w.isDefault && (
                          <div className="mt-1 flex items-center gap-1">
                            <CheckCircle className="h-3 w-3 text-blue-600" />
                            <span className="text-xs text-blue-600">Default</span>
                          </div>
                        )}
                        {w.description && (
                          <div className="mt-1 truncate text-xs text-gray-500">{w.description}</div>
                        )}
                        {lastRunTime && (
                          <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                            <Clock className="h-3 w-3" />
                            <span>Last run: {lastRunTime}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right Content Area */}
      <div className="flex-1 rounded-lg border border-gray-300 bg-white p-4 shadow-sm">
        {selectedWorkflowId ? (
          <>
            {viewMode === 'runs' && (
              <div className="flex h-full flex-col">
                {/* Header with title and top-right controls */}
                <div className="mb-4 flex items-start justify-between border-b border-gray-200 pb-4">
                  <div className="flex-1">
                    <h2 className="text-lg font-semibold text-gray-900">
                      {selectedWorkflowData?.name || 'Workflow Runs'}
                    </h2>
                    {selectedWorkflowData?.description && (
                      <p className="mt-1 text-sm text-gray-600">
                        {selectedWorkflowData.description}
                      </p>
                    )}
                  </div>
                  <div className="ml-4 flex items-center gap-3">
                    {/* Search bar */}
                    <div className="w-64">
                      <Input
                        type="text"
                        placeholder="Search runs..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        fullWidth
                      />
                    </div>
                    {/* Status filter */}
                    <div className="w-40">
                      <Select
                        options={[
                          { value: 'all', label: 'All Status' },
                          { value: 'pending', label: 'Pending' },
                          { value: 'running', label: 'Running' },
                          { value: 'succeeded', label: 'Succeeded' },
                          { value: 'failed', label: 'Failed' },
                          { value: 'blocked', label: 'Blocked' },
                          { value: 'skipped', label: 'Skipped' },
                        ]}
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as StepStatus | 'all')}
                        className="w-full"
                        placeholder={undefined}
                        fullWidth
                      />
                    </div>
                    {/* View Config button */}
                    <button
                      onClick={handleShowConfig}
                      className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                      <FileCode className="h-4 w-4" />
                      View Config
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-hidden">
                  <WorkflowRunsList
                    workflowId={selectedWorkflowId}
                    onRunSelect={handleRunSelect}
                    searchQuery={searchQuery}
                    statusFilter={statusFilter}
                  />
                </div>
              </div>
            )}

            {viewMode === 'run-details' && selectedRunId && (
              <RunDetailsView
                runId={selectedRunId}
                workflow={selectedWorkflow}
                onClose={handleBackToRuns}
              />
            )}

            {viewMode === 'config' && (
              <WorkflowConfigEditor
                workflowId={selectedWorkflowId}
                workflow={selectedWorkflow}
                onClose={handleCloseConfig}
              />
            )}
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-gray-500">
            Select a workflow to view details
          </div>
        )}
      </div>
    </div>
  );
}
