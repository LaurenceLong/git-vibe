import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ReactFlow,
  Background,
  Controls,
  type Edge,
  type Node,
  Handle,
  type NodeProps,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { workflowsApi } from '@/lib/api';
import { formatDuration } from '@/lib/datetime';
import { CheckCircle2, XCircle, Clock, Loader2, Ban, FileText } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { StepExecution, StepStatus, Workflow } from 'git-vibe-shared';

// Helper function to get status icon (shared by WorkflowStepNode and RunDetailsView)
function getStatusIcon(status: StepStatus) {
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
}

// Custom node component for workflow steps
interface WorkflowStepNodeData extends Record<string, unknown> {
  label: string;
  status: StepStatus;
  duration: string | null;
  nodeType: string;
  stepId?: string;
}

function WorkflowStepNode(props: NodeProps) {
  const data = props.data as WorkflowStepNodeData;
  const { label, status, duration, nodeType } = data;
  const selected = props.selected;

  const getStatusColor = (status: StepStatus) => {
    switch (status) {
      case 'succeeded':
        return 'border-green-500 bg-green-50';
      case 'failed':
        return 'border-red-500 bg-red-50';
      case 'running':
        return 'border-blue-500 bg-blue-50';
      case 'pending':
        return 'border-gray-300 bg-gray-50';
      case 'blocked':
        return 'border-yellow-500 bg-yellow-50';
      case 'skipped':
        return 'border-gray-300 bg-gray-50';
      default:
        return 'border-gray-300 bg-gray-50';
    }
  };

  return (
    <div className="relative flex flex-col items-center">
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-white !bg-gray-400"
      />
      <div
        className={`min-w-[200px] rounded-lg border p-3 shadow-sm ${getStatusColor(
          status
        )} ${selected ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
      >
        <div className="flex items-start gap-2">
          {getStatusIcon(status)}
          <div className="min-w-0 flex-1">
            <div className="font-medium text-gray-900">{label}</div>
            <div className="mt-1 text-xs text-gray-600">{nodeType}</div>
            {duration && <div className="mt-1 font-mono text-xs text-gray-500">{duration}</div>}
          </div>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-2 !border-white !bg-gray-400"
      />
    </div>
  );
}

const nodeTypes = {
  default: WorkflowStepNode,
};

export interface RunDetailsViewProps {
  runId: string;
  workflow?: Workflow | null;
  onClose?: () => void;
}

interface StepExecutionWithNode extends StepExecution {
  nodeName?: string;
}

export function RunDetailsView({ runId, workflow, onClose }: RunDetailsViewProps) {
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  // Get run data from workflow runs list (we'll need workflowId)
  // For now, we'll infer run status from steps
  const workflowId = workflow?.workflow?.id || '';

  const { data: stepsResponse, isLoading: isStepsLoading } = useQuery({
    queryKey: ['workflow-run-steps', runId],
    queryFn: async () => {
      const response = await workflowsApi.getRunSteps(runId);
      return response.data.data as StepExecution[];
    },
  });

  // Get run info from runs list
  const { data: runsResponse } = useQuery({
    queryKey: ['workflow-runs', workflowId],
    queryFn: async () => {
      if (!workflowId) return [];
      const response = await workflowsApi.getRuns(workflowId);
      return response.data.data;
    },
    enabled: !!workflowId,
  });

  const runResponse = useMemo(() => {
    if (!runsResponse) return null;
    return runsResponse.find((r: any) => r.id === runId) || null;
  }, [runsResponse, runId]);

  // Map node IDs to names from workflow definition
  const nodeNameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (workflow?.workflow?.backbone?.nodes) {
      workflow.workflow.backbone.nodes.forEach((node) => {
        map.set(node.id, node.display?.name || node.id);
      });
    }
    if (workflow?.workflow?.extensions?.nodes) {
      workflow.workflow.extensions.nodes.forEach((node) => {
        map.set(node.id, node.display?.name || node.id);
      });
    }
    return map;
  }, [workflow]);

  const stepsWithNames = useMemo(() => {
    if (!stepsResponse) return [];
    return stepsResponse.map((step) => ({
      ...step,
      nodeName: nodeNameMap.get(step.nodeId) || step.nodeId,
    })) as StepExecutionWithNode[];
  }, [stepsResponse, nodeNameMap]);

  // Build DAG from workflow definition and step executions
  const { nodes, edges } = useMemo(() => {
    if (!workflow?.workflow || !stepsWithNames.length) {
      return { nodes: [] as Node[], edges: [] as Edge[] };
    }

    const wf = workflow.workflow;
    const stepMap = new Map<string, StepExecutionWithNode>();
    stepsWithNames.forEach((step) => {
      stepMap.set(step.nodeId, step);
    });

    // Create nodes from workflow backbone + executed steps
    const dagNodes: Node[] = [];
    const allNodeIds = new Set<string>();

    // Calculate center X position for nodes (assuming ~200px node width)
    // Using a larger center value to ensure nodes appear centered in the viewport
    const nodeWidth = 200;
    const centerX = 400; // Center position for backbone nodes

    // Add backbone nodes
    if (wf.backbone?.nodes) {
      wf.backbone.nodes.forEach((node, idx) => {
        allNodeIds.add(node.id);
        const step = stepMap.get(node.id);
        const status = step?.status || 'pending';
        const duration =
          step?.startedAt && step?.finishedAt
            ? formatDuration(step.startedAt, step.finishedAt)
            : step?.startedAt
              ? formatDuration(step.startedAt, null)
              : null;

        dagNodes.push({
          id: node.id,
          type: 'default',
          position: { x: centerX - nodeWidth / 2, y: idx * 120 },
          data: {
            label: node.display?.name || node.id,
            status,
            duration,
            nodeType: node.trigger?.call?.resourceType || 'unknown',
            stepId: step?.id,
          },
        });
      });
    }

    // Add extension nodes (positioned to the right of backbone)
    if (wf.extensions?.nodes) {
      wf.extensions.nodes.forEach((node, idx) => {
        if (!allNodeIds.has(node.id)) {
          allNodeIds.add(node.id);
          const step = stepMap.get(node.id);
          const status = step?.status || 'pending';
          const duration =
            step?.startedAt && step?.finishedAt
              ? formatDuration(step.startedAt, step.finishedAt)
              : step?.startedAt
                ? formatDuration(step.startedAt, null)
                : null;

          dagNodes.push({
            id: node.id,
            type: 'default',
            position: { x: centerX + nodeWidth + 50, y: idx * 120 },
            data: {
              label: node.display?.name || node.id,
              status,
              duration,
              nodeType: node.trigger?.call?.resourceType || 'unknown',
              stepId: step?.id,
            },
          });
        }
      });
    }

    // Create edges from workflow structure
    const dagEdges: Edge[] = [];

    // Backbone sequential edges
    if (wf.backbone?.nodes && wf.backbone.nodes.length > 1) {
      for (let i = 0; i < wf.backbone.nodes.length - 1; i++) {
        const from = wf.backbone.nodes[i]!.id;
        const to = wf.backbone.nodes[i + 1]!.id;
        dagEdges.push({
          id: `backbone:${from}->${to}`,
          source: from,
          target: to,
          animated: false,
        });
      }
    }

    // Note: Transitions are handled through event listening in the optimized workflow design
    // Nodes connect via listens/onResult rules, not explicit transitions

    return { nodes: dagNodes, edges: dagEdges };
  }, [workflow, stepsWithNames]);

  const selectedStep = useMemo(() => {
    if (!selectedStepId || !stepsWithNames) return null;
    return stepsWithNames.find((s) => s.id === selectedStepId) || null;
  }, [selectedStepId, stepsWithNames]);

  if (isStepsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between border-b border-gray-200 pb-3">
        <div className="flex items-center gap-3">
          {onClose && (
            <button onClick={onClose} className="text-gray-600 hover:text-gray-900">
              ← Back
            </button>
          )}
          <h2 className="text-lg font-semibold text-gray-900">Run Details: {runId.slice(0, 8)}</h2>
          {runResponse && (
            <span className={`text-sm ${getStatusColorText(runResponse.status)}`}>
              {runResponse.status}
            </span>
          )}
        </div>
        {runResponse && runResponse.startedAt && (
          <div className="text-sm text-gray-600">
            {runResponse.finishedAt
              ? `Duration: ${formatDuration(runResponse.startedAt, runResponse.finishedAt)}`
              : `Started: ${new Date(runResponse.startedAt).toLocaleString()}`}
          </div>
        )}
      </div>

      {/* Main Content: DAG + Details */}
      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* DAG Visualization */}
        <div className="flex-1 rounded-lg border border-gray-300 bg-white">
          <style>{`
            /* Completely remove ReactFlow's default node wrapper styling */
            .react-flow__node,
            .react-flow__node-default,
            .react-flow__node.react-flow__node-default {
              border: none !important;
              background: transparent !important;
              padding: 0 !important;
              margin: 0 !important;
              box-shadow: none !important;
              width: auto !important;
              height: auto !important;
              min-width: 0 !important;
              min-height: 0 !important;
              outline: none !important;
            }
            .react-flow__node.selected,
            .react-flow__node-default.selected {
              box-shadow: none !important;
              outline: none !important;
            }
            /* Remove any default ReactFlow node content wrapper */
            .react-flow__node > div:first-child {
              width: 100% !important;
              height: 100% !important;
            }
          `}</style>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={(_event, node) => {
              const data = node.data as WorkflowStepNodeData;
              const stepId = data?.stepId;
              if (stepId && typeof stepId === 'string') {
                setSelectedStepId(stepId);
              }
            }}
            fitView
            fitViewOptions={{ padding: 0.2, includeHiddenNodes: false }}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>

        {/* Step Details Panel */}
        <div className="w-80 rounded-lg border border-gray-300 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Step Details</h3>
          {selectedStep ? (
            <div className="space-y-3">
              <div>
                <div className="text-xs text-gray-500">Node</div>
                <div className="text-sm font-medium text-gray-900">
                  {selectedStep.nodeName || selectedStep.nodeId}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Status</div>
                <div className="flex items-center gap-2">
                  {getStatusIcon(selectedStep.status)}
                  <span className={`text-sm ${getStatusColorText(selectedStep.status)}`}>
                    {selectedStep.status}
                  </span>
                </div>
              </div>
              {selectedStep.startedAt && (
                <div>
                  <div className="text-xs text-gray-500">Started</div>
                  <div className="text-sm text-gray-700">
                    {new Date(selectedStep.startedAt).toLocaleString()}
                  </div>
                </div>
              )}
              {selectedStep.finishedAt && (
                <div>
                  <div className="text-xs text-gray-500">Finished</div>
                  <div className="text-sm text-gray-700">
                    {new Date(selectedStep.finishedAt).toLocaleString()}
                  </div>
                </div>
              )}
              {selectedStep.startedAt && selectedStep.finishedAt && (
                <div>
                  <div className="text-xs text-gray-500">Duration</div>
                  <div className="text-sm text-gray-700">
                    {formatDuration(selectedStep.startedAt, selectedStep.finishedAt)}
                  </div>
                </div>
              )}
              {selectedStep.errorMessage && (
                <div>
                  <div className="text-xs text-gray-500">Error</div>
                  <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                    {selectedStep.errorMessage}
                  </div>
                </div>
              )}
              {selectedStep.artifacts && selectedStep.artifacts.length > 0 && (
                <div>
                  <div className="text-xs text-gray-500">Artifacts</div>
                  <div className="space-y-1">
                    {selectedStep.artifacts.map((artifact) => (
                      <div
                        key={artifact.id}
                        className="flex items-center gap-2 rounded border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700"
                      >
                        <FileText className="h-3 w-3" />
                        <span>{artifact.id}</span>
                        <span className="text-gray-500">({artifact.kind})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-gray-500">
              Click on a node in the graph to view step details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getStatusColorText(status: StepStatus): string {
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
}
