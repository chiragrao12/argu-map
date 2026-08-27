'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { STATUS_META } from './constants';
import { ArrowRight, Plus, Trash2, AlertTriangle, Clock, GitBranch } from 'lucide-react';

function TaskCard({ t, onUpdate, onDelete, onAddStep }) {
  return (
    <div className="w-64 shrink-0 rounded-lg border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <Input
          value={t.title}
          onChange={(e) => onUpdate(t.id, { title: e.target.value }, true)}
          onBlur={(e) => onUpdate(t.id, { title: e.target.value })}
          className="h-7 border-0 px-0 font-medium focus-visible:ring-0"
        />
        <button onClick={() => onDelete(t.id)} className="text-muted-foreground hover:text-red-500">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {t.content && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.content}</p>}
      <div className="mt-2 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${STATUS_META[t.status]?.cls}`} />
        <Select value={t.status} onValueChange={(v) => onUpdate(t.id, { status: v })}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.keys(STATUS_META).map((s) => (
              <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Input
        type="date"
        value={t.due_date || ''}
        onChange={(e) => onUpdate(t.id, { due_date: e.target.value })}
        className="h-7 mt-2 text-xs"
      />
      <Button size="sm" variant="outline" className="w-full mt-2 h-7" onClick={() => onAddStep(t)}>
        <Plus className="h-3 w-3 mr-1" /> Add / branch step
      </Button>
    </div>
  );
}

function StepTree({ id, byId, childrenOf, visited, ...handlers }) {
  const t = byId[id];
  if (!t || visited.has(id)) return null;
  const kids = (childrenOf[id] || []).filter((k) => byId[k] && !visited.has(k));
  const nextVisited = new Set([...visited, id]);
  return (
    <div className="flex items-center gap-3">
      <TaskCard t={t} {...handlers} />
      {kids.length > 0 && (
        <div className="flex items-center gap-1 shrink-0">
          {kids.length > 1 ? <GitBranch className="h-5 w-5 text-blue-400" /> : <ArrowRight className="h-5 w-5 text-blue-400" />}
        </div>
      )}
      {kids.length > 0 && (
        <div className="flex flex-col gap-4">
          {kids.map((kid) => (
            <StepTree key={kid} id={kid} byId={byId} childrenOf={childrenOf} visited={nextVisited} {...handlers} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TimelineView({ nodes, edges, onCreate, onUpdate, onDelete, onCreateEdge }) {
  const tasks = useMemo(() => nodes.filter((n) => n.type === 'task'), [nodes]);
  const followUps = useMemo(() => edges.filter((e) => e.relation === 'follow_up'), [edges]);

  const { byId, childrenOf, heads } = useMemo(() => {
    const byId = {};
    tasks.forEach((t) => (byId[t.id] = t));
    const childrenOf = {};
    const hasIncoming = new Set();
    followUps.forEach((e) => {
      if (byId[e.source_id] && byId[e.target_id]) {
        (childrenOf[e.source_id] = childrenOf[e.source_id] || []).push(e.target_id);
        hasIncoming.add(e.target_id);
      }
    });
    const heads = tasks.filter((t) => !hasIncoming.has(t.id));
    return { byId, childrenOf, heads };
  }, [tasks, followUps]);

  const addStepAfter = async (task) => {
    const existing = (childrenOf[task.id] || []).length;
    const step = await onCreate('task', {
      title: existing ? 'Branch step' : 'Next step',
      status: 'todo',
      position: { x: (task.position?.x || 0) + 300, y: (task.position?.y || 700) + existing * 140 },
    });
    if (step?.id) await onCreateEdge({ source_id: task.id, target_id: step.id, relation: 'follow_up' });
  };

  const reminders = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const in7 = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    const due = tasks.filter((t) => t.due_date && t.status !== 'done');
    const overdue = due.filter((t) => t.due_date < today).sort((a, b) => a.due_date.localeCompare(b.due_date));
    const upcoming = due.filter((t) => t.due_date >= today && t.due_date <= in7).sort((a, b) => a.due_date.localeCompare(b.due_date));
    return { overdue, upcoming };
  }, [tasks]);

  const handlers = { onUpdate, onDelete, onAddStep: addStepAfter };

  return (
    <div className="h-full overflow-auto p-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Rundown</h2>
          <p className="text-sm text-muted-foreground">Task chains that can branch into parallel sub-steps via follow-up.</p>
        </div>
        <Button size="sm" onClick={() => onCreate('task', { title: 'New chain', status: 'todo', position: { x: 120, y: 760 } })}>
          <Plus className="h-4 w-4 mr-1" /> New chain
        </Button>
      </div>

      {(reminders.overdue.length > 0 || reminders.upcoming.length > 0) && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-red-400 mb-2">
              <AlertTriangle className="h-4 w-4" /> Overdue ({reminders.overdue.length})
            </div>
            {reminders.overdue.length ? (
              <ul className="space-y-1">
                {reminders.overdue.map((t) => (
                  <li key={t.id} className="text-sm flex items-center justify-between gap-2">
                    <span className="truncate">{t.title}</span>
                    <span className="text-xs text-red-400 shrink-0">{t.due_date}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">Nothing overdue. Nice.</p>
            )}
          </div>
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-400 mb-2">
              <Clock className="h-4 w-4" /> Due in 7 days ({reminders.upcoming.length})
            </div>
            {reminders.upcoming.length ? (
              <ul className="space-y-1">
                {reminders.upcoming.map((t) => (
                  <li key={t.id} className="text-sm flex items-center justify-between gap-2">
                    <span className="truncate">{t.title}</span>
                    <span className="text-xs text-amber-400 shrink-0">{t.due_date}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">Nothing due this week.</p>
            )}
          </div>
        </div>
      )}

      {!heads.length && <p className="text-sm text-muted-foreground">No tasks yet. Create a chain to get started.</p>}

      <div className="space-y-8">
        {heads.map((h) => (
          <div key={h.id} className="overflow-x-auto pb-3">
            <StepTree id={h.id} byId={byId} childrenOf={childrenOf} visited={new Set()} {...handlers} />
          </div>
        ))}
      </div>
    </div>
  );
}
