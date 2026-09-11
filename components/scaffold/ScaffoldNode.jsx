'use client';

import { Handle, Position } from '@xyflow/react';
import { Flag, CheckCircle2, AlertTriangle, FileText, ListTodo, Pencil, Trash2 } from 'lucide-react';
import { STATUS_META } from './constants';

const ICONS = {
  claim: Flag,
  premise: CheckCircle2,
  objection: AlertTriangle,
  note: FileText,
  task: ListTodo,
};

function shellClasses(type, color, selected) {
  const ring = selected ? 'ring-2 ring-primary ' : '';
  if (type === 'objection' || color === 'amber')
    return ring + 'bg-amber-100 border-amber-400 text-amber-950 shadow-[2px_3px_0_rgba(180,120,0,0.35)]';
  if (type === 'task') return ring + 'bg-slate-900 border-blue-500/50 text-slate-100';
  if (type === 'note') return ring + 'bg-slate-800 border-slate-600 text-slate-100';
  if (type === 'premise') return ring + 'bg-white border-emerald-500/60 text-slate-900';
  return ring + 'bg-white border-slate-300 text-slate-900'; // claim
}

export default function ScaffoldNode({ data, selected }) {
  const Icon = ICONS[data.type] || FileText;
  const isAmber = data.type === 'objection' || data.color === 'amber';
  const iconTone = isAmber
    ? 'text-amber-700'
    : data.type === 'task'
    ? 'text-blue-400'
    : data.type === 'note'
    ? 'text-slate-300'
    : data.type === 'premise'
    ? 'text-emerald-600'
    : 'text-slate-700';

  return (
    <div
      className={`group relative w-56 rounded-lg border px-3 py-2 transition-opacity ${shellClasses(data.type, data.color, selected)} ${data.dimmed ? 'opacity-25' : ''}`}
    >
      <Handle type="target" position={Position.Top} className="!h-2.5 !w-2.5 !bg-slate-400" />
      <div className="flex items-center gap-2 mb-1">
        {data.outline_number && (
          <span className="shrink-0 rounded bg-slate-900/10 text-[10px] font-mono font-bold px-1.5 py-0.5 border border-current/20">
            {data.outline_number}
          </span>
        )}
        <Icon className={`h-3.5 w-3.5 shrink-0 ${iconTone}`} />
        <span className="text-sm font-semibold leading-tight line-clamp-2">{data.title}</span>
      </div>
      {data.content && (
        <p className="text-[11px] leading-snug opacity-80 line-clamp-3">{data.content}</p>
      )}
      {data.tags?.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {data.tags.map((t) => (
            <span key={t} className="rounded bg-slate-900/10 px-1.5 py-0.5 text-[9px] font-medium leading-none">
              {t}
            </span>
          ))}
        </div>
      )}
      {data.type === 'task' && (
        <div className="mt-1.5 flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${STATUS_META[data.status]?.cls || 'bg-slate-500'}`} />
          <span className="text-[10px] uppercase tracking-wide opacity-70">{STATUS_META[data.status]?.label || data.status}</span>
          {data.due_date && <span className="text-[10px] opacity-70">· {data.due_date}</span>}
        </div>
      )}
      <div className="absolute -top-2 -right-2 hidden group-hover:flex gap-1">
        <button onClick={() => data.onEdit?.(data.id)} className="h-6 w-6 rounded-full bg-slate-900 text-white flex items-center justify-center shadow hover:bg-slate-700">
          <Pencil className="h-3 w-3" />
        </button>
        <button onClick={() => data.onDelete?.(data.id)} className="h-6 w-6 rounded-full bg-red-600 text-white flex items-center justify-center shadow hover:bg-red-500">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <Handle type="source" position={Position.Bottom} className="!h-2.5 !w-2.5 !bg-slate-400" />
    </div>
  );
}
