import { useMemo } from 'react';
import { ReactFlow, Background, Controls, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Workflow } from 'git-vibe-shared';

type WorkflowFlowProps = {
  workflow: Workflow | null | undefined;
};

export function WorkflowFlow({ workflow }: WorkflowFlowProps) {
  const { nodes, edges } = useMemo(() => {
    if (!workflow?.workflow) {
      return { nodes: [] as Node[], edges: [] as Edge[] };
    }

    const wf = workflow.workflow;

    const backboneNodes: Node[] = (wf.backbone || []).map((n, idx) => ({
      id: n.id,
      type: 'default',
      position: { x: 0, y: idx * 110 },
      data: {
        label: `${n.display?.name ?? n.id} (${n.type}${n.action ? `:${n.action}` : ''})`,
      },
    }));

    // Simple default: sequential edges along the backbone
    const backboneEdges: Edge[] = [];
    for (let i = 0; i < (wf.backbone?.length ?? 0) - 1; i++) {
      const from = wf.backbone[i]!.id;
      const to = wf.backbone[i + 1]!.id;
      backboneEdges.push({
        id: `backbone:${from}->${to}`,
        source: from,
        target: to,
        animated: false,
      });
    }

    // Control transitions (e.g. conflict branch)
    const transitionEdges: Edge[] = (wf.control?.transitions || []).map((t) => ({
      id: `transition:${t.from}:${t.on}:${t.to}`,
      source: t.from,
      target: t.to,
      label: t.on,
      animated: t.on === 'conflict',
      style: t.on === 'conflict' ? { stroke: '#ef4444' } : undefined,
    }));

    // NOTE: extensions/slots are not laid out yet; they’ll be added next once the
    // graph is visible and we confirm desired UX (dify-like insert slots).
    const edgesById = new Map<string, Edge>();
    for (const e of [...backboneEdges, ...transitionEdges]) edgesById.set(e.id, e);

    return { nodes: backboneNodes, edges: Array.from(edgesById.values()) };
  }, [workflow]);

  return (
    <div className="h-[650px] w-full rounded-lg border border-gray-700 bg-gray-900">
      <ReactFlow nodes={nodes} edges={edges} fitView>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
