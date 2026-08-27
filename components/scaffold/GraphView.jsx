'use client';

import '@xyflow/react/dist/style.css';
import { useMemo } from 'react';
import { ReactFlow, Background, Controls } from '@xyflow/react';

export default function GraphView({ nodes, edges }) {
  const notes = useMemo(() => nodes.filter((n) => n.type === 'note'), [nodes]);

  const rfNodes = useMemo(() => {
    const R = 260;
    const cx = 400;
    const cy = 300;
    return notes.map((n, i) => {
      const a = (i / Math.max(notes.length, 1)) * Math.PI * 2;
      return {
        id: n.id,
        position: { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) },
        data: { label: n.title },
        style: {
          background: '#1e293b',
          color: '#e2e8f0',
          border: '1px solid #475569',
          borderRadius: 8,
          fontSize: 12,
          width: 150,
        },
      };
    });
  }, [notes]);

  const rfEdges = useMemo(() => {
    const byTitle = {};
    notes.forEach((n) => (byTitle[n.title.toLowerCase()] = n.id));
    const set = new Set();
    const out = [];
    // explicit backlink edges
    edges
      .filter((e) => e.relation === 'backlink')
      .forEach((e) => {
        const key = [e.source_id, e.target_id].sort().join('|');
        if (!set.has(key)) {
          set.add(key);
          out.push({ id: e.id, source: e.source_id, target: e.target_id, style: { stroke: '#64748b' } });
        }
      });
    // derived [[wikilink]] edges
    notes.forEach((n) => {
      const matches = (n.content || '').match(/\[\[([^\]]+)\]\]/g) || [];
      matches.forEach((m) => {
        const title = m.slice(2, -2).trim().toLowerCase();
        const target = byTitle[title];
        if (target && target !== n.id) {
          const key = [n.id, target].sort().join('|');
          if (!set.has(key)) {
            set.add(key);
            out.push({ id: `wl-${n.id}-${target}`, source: n.id, target, animated: true, style: { stroke: '#0ea5e9' } });
          }
        }
      });
    });
    return out;
  }, [notes, edges]);

  if (!notes.length) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        No plain notes yet. Create notes and link them with [[wikilinks]] to see the graph.
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <ReactFlow nodes={rfNodes} edges={rfEdges} fitView proOptions={{ hideAttribution: true }}>
        <Background color="#334155" gap={20} />
        <Controls className="!bg-slate-800 !border-slate-700 [&_button]:!bg-slate-800 [&_button]:!border-slate-700 [&_button]:!fill-slate-300" />
      </ReactFlow>
    </div>
  );
}
