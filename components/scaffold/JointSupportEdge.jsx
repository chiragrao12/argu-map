'use client';

import { EdgeLabelRenderer } from '@xyflow/react';
import { Scissors } from 'lucide-react';
import { STRENGTH_WIDTH } from './constants';

// Renders joint (syllogistic) support: each premise's line curves into a shared
// junction, and a single thicker "trunk" continues from the junction to the claim.
// Each branch also carries a small, low-visibility control to split that one
// premise back out of the joint group. Branch thickness reflects that one
// premise's strength; the trunk stays a fixed width — it represents the
// joint synthesis, not any single premise's strength.
export default function JointSupportEdge({ id, sourceX, sourceY, data, markerEnd }) {
  const junction = data?.junction;
  const targetPoint = data?.targetPoint;
  if (!junction) return null;
  const midY = (sourceY + junction.y) / 2;
  const midX = (sourceX + junction.x) / 2;
  const branch = `M ${sourceX},${sourceY} C ${sourceX},${midY} ${junction.x},${midY} ${junction.x},${junction.y}`;
  const branchWidth = STRENGTH_WIDTH[data.strength] || STRENGTH_WIDTH.moderate;
  return (
    <>
      <path d={branch} fill="none" style={{ stroke: '#10b981' }} strokeWidth={branchWidth} className="react-flow__edge-path" />
      {data.isTrunk && targetPoint && (
        <>
          <path
            d={`M ${junction.x},${junction.y} L ${targetPoint.x},${targetPoint.y}`}
            fill="none"
            style={{ stroke: '#10b981' }}
            strokeWidth={4}
            markerEnd={markerEnd}
            className="react-flow__edge-path"
          />
          <circle cx={junction.x} cy={junction.y} r={4} fill="#10b981" />
        </>
      )}
      {data.onUngroup && (
        <EdgeLabelRenderer>
          <button
            onClick={(e) => {
              e.stopPropagation();
              data.onUngroup(id);
            }}
            title="Split this premise out of the joint group"
            className="nodrag nopan absolute flex h-4 w-4 items-center justify-center rounded-full border border-emerald-500/50 bg-slate-800 text-emerald-400 opacity-30 transition-opacity hover:bg-slate-700 hover:opacity-100"
            style={{ left: midX, top: midY, transform: 'translate(-50%, -50%)', pointerEvents: 'all', zIndex: 1000 }}
          >
            <Scissors className="h-2.5 w-2.5" />
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
