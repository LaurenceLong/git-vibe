import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDateTime } from '@/lib/datetime';
import { getApiClient } from '@/lib/api';
import {
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  Terminal,
} from 'lucide-react';

function getWorkflowsApi() {
  const api = getApiClient();
  return {
    getRunSteps: async (runId: string) => {
      return api.get(`/workflow-runs/${runId}/steps`);
    },
  };
}

export interface WorkflowRunHistoryProps {
  workflowRunId: string;
  isExpanded?: boolean;
}

export function WorkflowRunHistory({ workflowRunId, isExpanded = false }: WorkflowRunHistoryProps) {
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const api = getWorkflowsApi();

  const {
    data: stepsResponse,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['workflow-run-steps', workflowRunId],
    queryFn: async () => {
      const response = await api.getRunSteps(workflowRunId);
      return response.data;
    },
    enabled: isExpanded,
  });

  if (!isExpanded) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="h-8 w-32 animate-pulse rounded bg-gray-800" />
                <div className="h-4 w-20 animate-pulse rounded bg-gray-800" />
              </div>
              <div className="h-6 w-16 animate-pulse rounded bg-gray-800" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-800 bg-red-900/20 p-4">
        <p className="text-center text-red-400">Failed to load step history</p>
      </div>
    );
  }

  if (!stepsResponse || stepsResponse.length === 0) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
        <p className="text-center text-gray-500">No steps recorded</p>
      </div>
    );
  }

  const steps = stepsResponse;

  return (
    <div className="overflow-hidden rounded-lg border border-gray-700 bg-gray-900">
      <div className="border-b border-gray-700 bg-gray-800 px-4 py-2">
        <h3 className="text-sm font-semibold text-gray-200">Workflow Execution History</h3>
      </div>

      <div className="p-4">
        <div className="space-y-2">
          {steps.map((step: any, index) => (
            <StepRow
              key={step.id}
              step={step}
              index={index}
              isExpanded={expandedStepId === step.id}
              onToggle={() => setExpandedStepId(expandedStepId === step.id ? null : step.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface StepRowProps {
  step: any;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}

function StepRow({ step, index, isExpanded, onToggle }: StepRowProps) {
  const outputs = step.outputs || {};
  const artifacts = step.artifacts || [];
  const errorMessage = step.errorMessage;

  return (
    <div className="rounded border border-gray-700 bg-gray-800/50">
      <div
        className="flex cursor-pointer items-center justify-between px-3 py-2 transition-colors hover:bg-gray-800"
        onClick={onToggle}
      >
        <div className="flex items-center space-x-3">
          <span className="text-xs text-gray-500">Step {index + 1}</span>
          <span className="font-mono text-sm text-gray-300">{step.nodeId}</span>
          <StepStatusBadge status={step.status} />
        </div>
        <button className="text-gray-400 hover:text-gray-200">
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {isExpanded && (
        <div className="space-y-3 border-t border-gray-700 px-3 py-2">
          {errorMessage && (
            <div className="rounded border border-red-800 bg-red-900/20 px-3 py-2">
              <div className="flex items-start space-x-2">
                <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-300">Error</p>
                  <p className="mt-1 text-xs text-red-400">{errorMessage}</p>
                </div>
              </div>
            </div>
          )}

          <div>
            <h4 className="mb-2 text-xs font-semibold text-gray-400">Outputs</h4>
            {Object.keys(outputs).length > 0 ? (
              <div className="space-y-1">
                {Object.entries(outputs).map(([key, value]) => (
                  <div key={key} className="flex items-start space-x-2">
                    <span className="font-mono text-xs text-gray-500">{key}:</span>
                    <span className="text-xs text-gray-300">
                      {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500">No outputs</p>
            )}
          </div>

          {artifacts.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold text-gray-400">Artifacts</h4>
              <div className="space-y-1">
                {artifacts.map((artifact: any) => (
                  <ArtifactItem key={artifact.id} artifact={artifact} />
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>
              Started: {step.startedAt ? formatDateTime(new Date(step.startedAt)) : 'Not started'}
            </span>
            <span>
              Finished:{' '}
              {step.finishedAt ? formatDateTime(new Date(step.finishedAt)) : 'In progress'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

interface ArtifactItemProps {
  artifact: any;
}

function ArtifactItem({ artifact }: ArtifactItemProps) {
  const kind = artifact.kind;

  return (
    <div className="flex items-start space-x-2 rounded border border-gray-600 bg-gray-800 px-2 py-1.5">
      <ArtifactIcon kind={kind} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center space-x-2">
          <span className="truncate font-mono text-xs text-gray-400">{artifact.id}</span>
          <ArtifactKindBadge kind={kind} />
        </div>
        {artifact.ref && <p className="truncate text-xs text-gray-500">{artifact.ref}</p>}
      </div>
    </div>
  );
}

function ArtifactIcon({ kind }: { kind: string }) {
  switch (kind) {
    case 'log':
      return <Terminal className="h-3.5 w-3.5 text-gray-400" />;
    case 'json':
    case 'text':
      return <FileText className="h-3.5 w-3.5 text-gray-400" />;
    default:
      return <FileText className="h-3.5 w-3.5 text-gray-400" />;
  }
}

function ArtifactKindBadge({ kind }: { kind: string }) {
  const config: Record<string, { variant: 'success' | 'info' | 'neutral'; label: string }> = {
    log: { variant: 'info', label: 'Log' },
    json: { variant: 'success', label: 'JSON' },
    text: { variant: 'neutral', label: 'Text' },
    patch: { variant: 'warning', label: 'Patch' },
    session: { variant: 'success', label: 'Session' },
  };

  const cfg = config[kind] || { variant: 'neutral', label: kind };

  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${getBadgeVariantClasses(cfg.variant)}`}
    >
      {cfg.label}
    </span>
  );
}

function StepStatusBadge({ status }: { status: string }) {
  const config: Record<
    string,
    {
      variant: 'success' | 'warning' | 'destructive' | 'info' | 'neutral';
      icon: any;
      label: string;
    }
  > = {
    pending: { variant: 'neutral', icon: Clock, label: 'Pending' },
    running: { variant: 'info', icon: Clock, label: 'Running' },
    succeeded: { variant: 'success', icon: CheckCircle, label: 'Succeeded' },
    failed: { variant: 'destructive', icon: XCircle, label: 'Failed' },
    blocked: { variant: 'warning', icon: XCircle, label: 'Blocked' },
    skipped: { variant: 'neutral', icon: Clock, label: 'Skipped' },
  };

  const cfg = config[status] || { variant: 'neutral', icon: Clock, label: status };

  return (
    <span
      className={`inline-flex items-center space-x-1.5 rounded-full px-2 py-1 text-xs font-medium ${getBadgeVariantClasses(cfg.variant)}`}
    >
      <cfg.icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function getBadgeVariantClasses(
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
