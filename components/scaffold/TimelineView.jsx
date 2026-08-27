'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { STATUS_META } from './constants';
import { ArrowRight, Plus, Trash2 } from 'lucide-react';

export default function TimelineView({ nodes, edges, onCreate, onUpdate, onDelete, onCreateEdge }) {
  const tasks = useMemo(() => nodes.filter((n) => n.type === 'task'), [nodes]);
  const followUps = useMemo(() => edges.filter((e) => e.relation === 'follow_up'), [edges]);

  const chains = useMemo(() => {
    const byId = {};
    tasks.forEach((t) => (byId[t.id] = t));
    const nextOf = {};
    const hasIncoming = new Set();
    followUps.forEach((e) => {
      if (byId[e.source_id] && byId[e.target_id]) {
        nextOf[e.source_id] = e.target_id;
        hasIncoming.add(e.target_id);
      }
    });
    const heads = tasks.filter((t) => !hasIncoming.has(t.id));
    const result = [];
    heads.forEach((h) => {
      const chain = [];
      let cur = h.id;
      const guard = new Set();
      while (cur && byId[cur] && !guard.has(cur)) {
        guard.add(cur);
        chain.push(byId[cur]);
        cur = nextOf[cur];
      }
      result.push(chain);
    });
    return result;
  }, [tasks, followUps]);

  const addStepAfter = async (task) => {
    const step = await onCreate('task', { title: 'New step', status: 'todo', position: { x: (task.position?.x || 0) + 300, y: task.position?.y || 700 } });
    if (step?.id) await onCreateEdge({ source_id: task.id, target_id: step.id, relation: 'follow_up' });
  };

  return (
    <div className="h-full overflow-auto p-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Rundown</h2>
          <p className="text-sm text-muted-foreground">Linear task chains. Each step flows into the next via follow-up.</p>
        </div>
        <Button size="sm" onClick={() => onCreate('task', { title: 'New chain', status: 'todo', position: { x: 120, y: 760 } })}>
          <Plus className="h-4 w-4 mr-1" /> New chain
        </Button>
      </div>

      {!chains.length && <p className="text-sm text-muted-foreground">No tasks yet. Create a chain to get started.</p>}

      {chains.map((chain, ci) => (
        <div key={ci} className="flex items-stretch gap-3 overflow-x-auto pb-3">
          {chain.map((t, i) => (
            <div key={t.id} className="flex items-center gap-3">
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
                {i === chain.length - 1 && (
                  <Button size="sm" variant="outline" className="w-full mt-2 h-7" onClick={() => addStepAfter(t)}>
                    <Plus className="h-3 w-3 mr-1" /> Add step
                  </Button>
                )}
              </div>
              {i < chain.length - 1 && <ArrowRight className="h-5 w-5 text-blue-400 shrink-0" />}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
