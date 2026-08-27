'use client';

import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
  MarkerType,
} from '@xyflow/react';
import ScaffoldNode from './ScaffoldNode';
import { RELATIONS } from './constants';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function edgeStyle(relation, joint) {
  if (relation === 'supports')
    return { stroke: '#10b981', strokeWidth: joint ? 3.5 : 2.5 };
  if (relation === 'objects_to')
    return { stroke: '#9ca3af', strokeWidth: 2, strokeDasharray: '6 4' };
  if (relation === 'follow_up') return { stroke: '#3b82f6', strokeWidth: 2 };
  return { stroke: '#64748b', strokeWidth: 1.5 };
}

function Inner({ nodes, edges, onCreateEdge, onUpdatePosition, onEditNode, onDeleteNode }) {
  const [rfNodes, setRfNodes] = useState([]);
  const [pending, setPending] = useState(null);
  const [relation, setRelation] = useState('supports');

  const toRf = useCallback(
    (n) => ({
      id: n.id,
      type: 'scaffold',
      position: n.position || { x: 0, y: 0 },
      data: { ...n, onEdit: onEditNode, onDelete: onDeleteNode },
    }),
    [onEditNode, onDeleteNode]
  );

  useEffect(() => {
    setRfNodes(nodes.map(toRf));
  }, [nodes, toRf]);

  const onNodesChange = useCallback((chs) => setRfNodes((nds) => applyNodeChanges(chs, nds)), []);
  const onNodeDragStop = useCallback((_e, node) => onUpdatePosition(node.id, node.position), [onUpdatePosition]);

  const rfEdges = useMemo(
    () =>
      edges.map((e) => ({
        id: e.id,
        source: e.source_id,
        target: e.target_id,
        label: e.joint_group_id ? 'joint' : e.relation.replace('_', ' '),
        labelStyle: { fontSize: 10, fill: '#94a3b8' },
        labelBgStyle: { fill: '#0f172a' },
        style: edgeStyle(e.relation, e.joint_group_id),
        markerEnd: { type: MarkerType.ArrowClosed, color: edgeStyle(e.relation, e.joint_group_id).stroke },
      })),
    [edges]
  );

  const nodeTypes = useMemo(() => ({ scaffold: ScaffoldNode }), []);

  const onConnect = useCallback((params) => {
    setPending(params);
    setRelation('supports');
  }, []);

  const confirmEdge = () => {
    if (pending) onCreateEdge({ source_id: pending.source, target_id: pending.target, relation });
    setPending(null);
  };

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        fitView
        minZoom={0.2}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#334155" gap={20} />
        <Controls className="!bg-slate-800 !border-slate-700 [&_button]:!bg-slate-800 [&_button]:!border-slate-700 [&_button]:!fill-slate-300" />
        <MiniMap pannable zoomable className="!bg-slate-900" nodeColor={(n) => (n.data?.type === 'objection' ? '#f59e0b' : n.data?.type === 'task' ? '#3b82f6' : '#e2e8f0')} />
      </ReactFlow>

      <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect nodes</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Choose what this connection means.</p>
          <Select value={relation} onValueChange={setRelation}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RELATIONS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button onClick={confirmEdge}>Create edge</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function CanvasView(props) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}
