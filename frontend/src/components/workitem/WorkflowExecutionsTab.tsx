/**
 * WorkflowExecutionsTab Component
 *
 * Displays workflow execution history for a WorkItem
 * Shows run status, step details, artifacts, and logs
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { WorkflowRunSchema } from 'git-vibe-shared';
import { formatDateTime } from '@/lib/datetime';
import { ChevronDown, ChevronUp, CheckCircle, XCircle, Clock } from 'lucide-react';

function getWorkflowsApi() {
  const api = (window as any).api;
  return {
    getWorkItemRuns: async (workItemId: string) => {
      return api.get(`/workitems/${workItemId}/workflow-runs`);
    },
    getRunSteps: async (runId: string) => {
      return api.get(`/workflow-runs/${runId}/steps`);
    },
  };
}

export interface WorkflowExecutionsTabProps {
  workItemId: string;
  isActive?: boolean;
}

export function WorkflowExecutionsTab({ workItemId, isActive }: WorkflowExecutionsTabProps) {
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const api = getWorkflowsApi();

  const {
    data: runsResponse,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['workflow-runs', workItemId],
    queryFn: async () => {
      const response = await api.getWorkItemRuns(workItemId);
      return WorkflowRunSchema.array().parse(response.data);
    },
    enabled: isActive,
  });

  if (!isActive) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
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
        <p className="text-center text-red-400">Failed to load workflow runs</p>
      </div>
    );
  }

  const runs = runsResponse || [];

  if (runs.length === 0) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-900 p-8">
        <div className="text-center">
          <Clock className="mx-auto mb-4 h-12 w-12 text-gray-500" />
          <h3 className="mb-2 text-lg font-semibold text-gray-300">No Workflow Runs</h3>
          <p className="text-sm text-gray-500">
            Workflow executions for this WorkItem will appear here
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-100">Workflow Runs</h3>
        <span className="text-sm text-gray-500">
          {runs.length} run{runs.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-2">
        {runs.map((run: any) => (
          <WorkflowRunCard
            key={run.id}
            run={run}
            isExpanded={expandedRunId === run.id}
            onToggle={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}
          />
        ))}
      </div>
    </div>
  );
}

interface WorkflowRunCardProps {
  run: any;
  isExpanded: boolean;
  onToggle: () => void;
}

function WorkflowRunCard({ run, isExpanded, onToggle }: WorkflowRunCardProps) {
  const stepsResponse = useQuery({
    queryKey: ['workflow-run-steps', run.id],
    queryFn: async () => {
      const api = (window as any).api;
      const response = await api.get(`/workflow-runs/${run.id}/steps`);
      return response.data;
    },
    enabled: isExpanded,
  });

  const steps = stepsResponse.data || [];

  const stepStats = {
    total: steps.length,
    succeeded: steps.filter((s: any) => s.status === 'succeeded').length,
    failed: steps.filter((s: any) => s.status === 'failed').length,
    running: steps.filter((s: any) => s.status === 'running').length,
    pending: steps.filter((s: any) => s.status === 'pending').length,
  };

  return (
    <div>
      <div className="rounded-lg border border-gray-700 bg-gray-800/50 transition-all">
        <div
          className="flex cursor-pointer items-center justify-between px-4 py-3 transition-colors hover:bg-gray-800"
          onClick={onToggle}
        >
          <div className="flex flex-1 items-center space-x-3">
            <StatusBadge status={run.status} />
            <span className="text-sm text-gray-400">
              Started {formatDateTime(new Date(run.startedAt))}
            </span>
            {run.currentStepId && (
              <span className="text-xs text-gray-500">Current: {run.currentStepId}</span>
            )}
          </div>
          <div className="flex items-center space-x-3">
            <div className="text-xs text-gray-500">
              <span className="font-medium text-gray-400">{stepStats.succeeded}</span> /{' '}
              {stepStats.total} steps
            </div>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="ml-4 mt-2 space-y-2">
          <div className="grid grid-cols-5 gap-2 rounded-lg bg-gray-800 p-3 text-xs">
            <StatItem label="Total" value={stepStats.total} />
            <StatItem label="Pending" value={stepStats.pending} variant="neutral" />
            <StatItem label="Running" value={stepStats.running} variant="info" />
            <StatItem label="Succeeded" value={stepStats.succeeded} variant="success" />
            <StatItem label="Failed" value={stepStats.failed} variant="destructive" />
          </div>

          <div className="space-y-1">
            <h4 className="mb-2 text-xs font-semibold text-gray-400">Step Details</h4>
            {steps.map((step: any, index: number) => (
              <StepRow key={step.id} step={step} index={index} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface StepRowProps {
  step: any;
  index: number;
}

function StepRow({ step, index }: StepRowProps) {
  const outputs = step.outputs || {};
  const artifacts = step.artifacts || [];
  const errorMessage = step.errorMessage;

  return (
    <div className="rounded border border-gray-700 bg-gray-800/50">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-500">{index + 1}</span>
          <span className="font-mono text-sm text-gray-300">{step.nodeId}</span>
          <StepStatusBadge status={step.status} />
        </div>
        <span className="text-xs text-gray-500">
          {step.startedAt ? formatDateTime(new Date(step.startedAt)) : 'Not started'}
        </span>
      </div>

      {errorMessage && (
        <div className="border-t border-gray-700 px-3 py-2">
          <div className="flex items-start space-x-2">
            <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
            <p className="text-sm text-red-300">{errorMessage}</p>
          </div>
        </div>
      )}

      {outputs && Object.keys(outputs).length > 0 && (
        <div className="border-t border-gray-700 px-3 py-2">
          <h5 className="mb-1 text-xs font-semibold text-gray-400">Outputs</h5>
          <div className="space-y-1">
            {Object.entries(outputs).map(([key, value]: [string, any]) => (
              <div key={key} className="flex items-start space-x-2">
                <span className="font-mono text-xs text-gray-500">{key}:</span>
                <span className="text-xs text-gray-300">
                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {artifacts.length > 0 && (
        <div className="border-t border-gray-700 px-3 py-2">
          <h5 className="mb-1 text-xs font-semibold text-gray-400">Artifacts</h5>
          <div className="space-y-1">
            {artifacts.map((artifact: any) => (
              <ArtifactItem key={artifact.id} artifact={artifact} />
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-gray-700 px-3 py-2 text-xs text-gray-500">
        <span>
          Finished: {step.finishedAt ? formatDateTime(new Date(step.finishedAt)) : 'In progress'}
        </span>
      </div>
    </div>
  );
}

interface ArtifactItemProps {
  artifact: any;
}

function ArtifactItem({ artifact }: ArtifactItemProps) {
  const kind = artifact.kind;

  return (
    <div className="flex items-start space-x-2 rounded border border-gray-700 bg-gray-800 px-2 py-1.5">
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
  const icons = {
    log: 'Clock',
    json: 'Code',
    text: 'FileText',
    patch: 'GitMerge',
    session: 'Database',
  };

  const IconComponent = icons[kind] || 'FileText';

  const lucideIcons = {
    Clock,
    Code: FileText,
    FileText,
    GitMerge: FileText,
    Database: FileText,
  };

  const Icon = lucideIcons[IconComponent] || FileText;

  return <Icon className="h-3.5 w-3.5 text-gray-400" />;
}

function ArtifactKindBadge({ kind }: { kind: string }) {
  const config: Record<
    string,
    { variant: 'success' | 'info' | 'neutral' | 'warning'; label: string }
  > = {
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

function StatItem({
  label,
  value,
  variant = 'neutral',
}: {
  label: string;
  value: number;
  variant?: string;
}) {
  return (
    <div className="text-center">
      <div className={`text-lg font-semibold ${getStatVariantClasses(variant)}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

function getStatVariantClasses(variant: string): string {
  const classes = {
    success: 'text-green-400',
    warning: 'text-yellow-400',
    destructive: 'text-red-400',
    info: 'text-blue-400',
    neutral: 'text-gray-300',
  };
  return classes[variant] || classes.neutral;
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

function Skeleton({ className }: { className?: string }) {
  return <div className={`h-4 animate-pulse bg-gray-700 ${className || ''}`} />;
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
      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getBadgeVariantClasses(cfg.variant)}`}
    >
      {cfg.label}
    </span>
  );
}
