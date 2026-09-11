'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { History, Loader2, RotateCcw, Save } from 'lucide-react';

function formatWhen(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch (_) {
    return iso;
  }
}

export default function SnapshotPanel({ open, onOpenChange, onList, onSave, onRestore }) {
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    setLoading(true);
    const res = await onList();
    setSnapshots(Array.isArray(res) ? res : []);
    setLoading(false);
  };

  useEffect(() => {
    if (open) reload();
  }, [open]);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    await onSave(label.trim() || null);
    setLabel('');
    await reload();
    setBusy(false);
  };

  const restore = async (id) => {
    if (busy) return;
    setBusy(true);
    await onRestore(id);
    await reload();
    setBusy(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4 text-emerald-400" /> History
          </DialogTitle>
          <DialogDescription>Save and restore snapshots of this case.</DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Optional label…" disabled={busy} />
          <Button size="sm" onClick={save} disabled={busy}>
            <Save className="h-3.5 w-3.5 mr-1" /> Save snapshot
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : snapshots.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No snapshots yet — save one above.</p>
        ) : (
          <div className="space-y-2 max-h-[50vh] overflow-auto">
            {snapshots.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{s.label || 'Untitled snapshot'}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatWhen(s.created_at)} · {s.node_count} nodes · {s.edge_count} edges
                  </div>
                </div>
                <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" disabled={busy} onClick={() => restore(s.id)}>
                  <RotateCcw className="h-3 w-3 mr-1" /> Restore
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
