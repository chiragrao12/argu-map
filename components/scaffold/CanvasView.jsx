'use client';

import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toPng } from 'html-to-image';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Panel,
  applyNodeChanges,
  MarkerType,
  useReactFlow,
  getNodesBounds,
  getViewportForBounds,
} from '@xyflow/react';
import { toast } from 'sonner';
import ScaffoldNode from './ScaffoldNode';
import JointSupportEdge from './JointSupportEdge';
import { RELATIONS, STRENGTHS, STRENGTH_WIDTH } from './constants';
import { detectCycle } from '@/lib/graph';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Image, FileDown, GitMerge, LayoutGrid } from 'lucide-react';

function download(dataUrl, name) {
  const a = document.createElement('a');
  a.setAttribute('download', name);
  a.setAttribute('href', dataUrl);
  a.click();
}

function buildMarkdown(nodes, edges) {
  const argTypes = ['claim', 'premise', 'objection'];
  const args = nodes.filter((n) => argTypes.includes(n.type));
  const childrenOf = {};
  args.forEach((n) => {
    if (n.parent_id) (childrenOf[n.parent_id] = childrenOf[n.parent_id] || []).push(n);
  });
  const roots = args.filter((n) => !n.parent_id || !args.find((p) => p.id === n.parent_id));
  const seen = new Set();
  const lines = ['# Argument Map', ''];
  const walk = (n, depth) => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    const tag = n.type === 'objection' ? 'Objection' : n.type === 'claim' ? 'Claim' : 'Premise';
    lines.push(`${'  '.repeat(depth)}- **[${n.outline_number || '?'}] ${tag}:** ${n.title}${n.content ? ` — ${n.content}` : ''}`);
    (childrenOf[n.id] || []).sort((a, b) => (a.outline_number || '').localeCompare(b.outline_number || '')).forEach((c) => walk(c, depth + 1));
  };
  roots.sort((a, b) => (a.outline_number || '').localeCompare(b.outline_number || '')).forEach((r) => walk(r, 0));
  if (lines.length === 2) lines.push('_No argument nodes yet._');
  return lines.join('\n');
}

function edgeStyle(relation, strength) {
  if (relation === 'supports')
    return { stroke: '#10b981', strokeWidth: STRENGTH_WIDTH[strength] || STRENGTH_WIDTH.moderate };
  if (relation === 'objects_to')
    return { stroke: '#9ca3af', strokeWidth: 2, strokeDasharray: '6 4' };
  if (relation === 'follow_up') return { stroke: '#3b82f6', strokeWidth: 2 };
  return { stroke: '#64748b', strokeWidth: 1.5 };
}

function edgeLabel(e) {
  const base = e.relation.replace('_', ' ');
  if (e.relation === 'supports' && e.strength && e.strength !== 'moderate') return `${base} · ${e.strength}`;
  return base;
}

function Inner({ nodes, edges, onCreateEdge, onUpdatePosition, onEditNode, onDeleteNode, onGroupEdges, onUngroupEdge, onUpdateEdgeStrength, onTidy, focusNodeId }) {
  const [rfNodes, setRfNodes] = useState([]);
  const [pending, setPending] = useState(null);
  const [relation, setRelation] = useState('supports');
  const [strength, setStrength] = useState('moderate');
  const [editingEdge, setEditingEdge] = useState(null);
  const [editStrength, setEditStrength] = useState('moderate');
  const [selectedNodeIds, setSelectedNodeIds] = useState([]);
  const { setCenter, getNodes } = useReactFlow();

  const exportPng = useCallback(() => {
    const flowNodes = getNodes();
    if (!flowNodes.length) return;
    const bounds = getNodesBounds(flowNodes);
    const width = 1600;
    const height = 1000;
    const vp = getViewportForBounds(bounds, width, height, 0.3, 2, 0.15);
    const viewport = document.querySelector('.react-flow__viewport');
    if (!viewport) return;
    toPng(viewport, {
      backgroundColor: '#0b1220',
      width,
      height,
      style: {
        width: `${width}px`,
        height: `${height}px`,
        transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`,
      },
    }).then((url) => download(url, 'scaffold-argument-map.png'));
  }, [getNodes]);

  const exportMd = useCallback(() => {
    const md = buildMarkdown(nodes, edges);
    const url = `data:text/markdown;charset=utf-8,${encodeURIComponent(md)}`;
    download(url, 'scaffold-argument-map.md');
  }, [nodes, edges]);

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

  // Center the viewport on a node when a search result is picked.
  useEffect(() => {
    if (!focusNodeId) return;
    const n = nodes.find((x) => x.id === focusNodeId);
    if (n?.position) setCenter(n.position.x + 112, n.position.y + 60, { zoom: 1.15, duration: 600 });
  }, [focusNodeId, nodes, setCenter]);

  const onNodesChange = useCallback((chs) => setRfNodes((nds) => applyNodeChanges(chs, nds)), []);
  const onNodeDragStop = useCallback((_e, node) => onUpdatePosition(node.id, node.position), [onUpdatePosition]);
  const onSelectionChange = useCallback(({ nodes: sel }) => setSelectedNodeIds(sel.map((n) => n.id)), []);

  // Group candidate: 2+ selected nodes that each have their own solo
  // `supports` edge into the same claim can be merged into one joint group.
  const groupCandidateEdgeIds = useMemo(() => {
    if (selectedNodeIds.length < 2) return null;
    const candidateEdges = selectedNodeIds.map((id) => edges.find((e) => e.relation === 'supports' && e.source_id === id));
    if (candidateEdges.some((e) => !e)) return null;
    const targets = new Set(candidateEdges.map((e) => e.target_id));
    if (targets.size !== 1) return null;
    return candidateEdges.map((e) => e.id);
  }, [selectedNodeIds, edges]);

  const rfEdges = useMemo(() => {
    const posById = {};
    nodes.forEach((n) => (posById[n.id] = n.position || { x: 0, y: 0 }));
    // Group joint supports by joint_group_id and compute a shared junction point.
    const groups = {};
    edges.forEach((e) => {
      if (e.relation === 'supports' && e.joint_group_id) {
        (groups[e.joint_group_id] = groups[e.joint_group_id] || { target: e.target_id, edges: [] }).edges.push(e);
      }
    });
    const junctionByGroup = {};
    Object.entries(groups).forEach(([gid, g]) => {
      const t = posById[g.target];
      if (!t) return;
      const sxs = g.edges.map((e) => posById[e.source_id]).filter(Boolean).map((p) => p.x + 112);
      const jx = sxs.length ? sxs.reduce((a, b) => a + b, 0) / sxs.length : t.x + 112;
      junctionByGroup[gid] = { junction: { x: jx, y: t.y - 50 }, targetPoint: { x: t.x + 112, y: t.y } };
    });

    return edges.map((e) => {
      if (e.relation === 'supports' && e.joint_group_id && junctionByGroup[e.joint_group_id]) {
        const jg = junctionByGroup[e.joint_group_id];
        const isTrunk = groups[e.joint_group_id].edges[0].id === e.id;
        return {
          id: e.id,
          source: e.source_id,
          target: e.target_id,
          type: 'joint',
          data: { ...jg, isTrunk, strength: e.strength, onUngroup: onUngroupEdge },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981' },
        };
      }
      return {
        id: e.id,
        source: e.source_id,
        target: e.target_id,
        label: edgeLabel(e),
        labelStyle: { fontSize: 10, fill: '#94a3b8' },
        labelBgStyle: { fill: '#0f172a' },
        style: edgeStyle(e.relation, e.strength),
        markerEnd: { type: MarkerType.ArrowClosed, color: edgeStyle(e.relation, e.strength).stroke },
      };
    });
  }, [edges, nodes, onUngroupEdge]);

  const nodeTypes = useMemo(() => ({ scaffold: ScaffoldNode }), []);
  const edgeTypes = useMemo(() => ({ joint: JointSupportEdge }), []);

  const onConnect = useCallback(
    (params) => {
      if (detectCycle(edges, params.source, params.target)) {
        toast.error('Would create a circular argument');
        return;
      }
      setPending(params);
      setRelation('supports');
      setStrength('moderate');
    },
    [edges]
  );

  const confirmEdge = () => {
    if (pending) {
      const payload = { source_id: pending.source, target_id: pending.target, relation };
      if (relation === 'supports') payload.strength = strength;
      onCreateEdge(payload);
    }
    setPending(null);
  };

  const groupSelected = () => {
    if (groupCandidateEdgeIds) onGroupEdges(groupCandidateEdgeIds);
  };

  const onEdgeClick = useCallback(
    (_e, rfEdge) => {
      const raw = edges.find((e) => e.id === rfEdge.id);
      if (raw?.relation !== 'supports') return;
      setEditingEdge(raw);
      setEditStrength(raw.strength || 'moderate');
    },
    [edges]
  );

  const saveEdgeStrength = () => {
    if (editingEdge) onUpdateEdgeStrength(editingEdge.id, editStrength);
    setEditingEdge(null);
  };

  return (
    <div className="h-full w-full relative">
      {nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6">
          <p className="text-center text-xl md:text-2xl italic font-light tracking-tight text-muted-foreground/20 select-none">
            &ldquo;Believe so as to doubt, doubt so as to believe&rdquo;
          </p>
        </div>
      )}
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        onEdgeClick={onEdgeClick}
        fitView
        minZoom={0.2}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#334155" gap={20} />
        <Panel position="top-left" className="flex gap-2">
          <Button size="sm" variant="secondary" className="h-7 text-xs shadow" onClick={exportPng}>
            <Image className="h-3.5 w-3.5 mr-1" /> PNG
          </Button>
          <Button size="sm" variant="secondary" className="h-7 text-xs shadow" onClick={exportMd}>
            <FileDown className="h-3.5 w-3.5 mr-1" /> Markdown
          </Button>
          <Button size="sm" variant="secondary" className="h-7 text-xs shadow" onClick={onTidy}>
            <LayoutGrid className="h-3.5 w-3.5 mr-1" /> Tidy
          </Button>
          {groupCandidateEdgeIds && (
            <Button size="sm" variant="default" className="h-7 text-xs shadow" onClick={groupSelected}>
              <GitMerge className="h-3.5 w-3.5 mr-1" /> Group as joint support
            </Button>
          )}
        </Panel>
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
          {relation === 'supports' && (
            <div>
              <Label className="text-xs">Strength</Label>
              <Select value={strength} onValueChange={setStrength}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STRENGTHS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button onClick={confirmEdge}>Create edge</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingEdge} onOpenChange={(o) => !o && setEditingEdge(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit support strength</DialogTitle>
          </DialogHeader>
          <Select value={editStrength} onValueChange={setEditStrength}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STRENGTHS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingEdge(null)}>
              Cancel
            </Button>
            <Button onClick={saveEdgeStrength}>Save</Button>
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
