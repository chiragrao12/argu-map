'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertTriangle, Unlink, Trash2 } from 'lucide-react';

export default function IntegrityPanel({ open, onOpenChange, orphans, onDetach, onDelete }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Integrity check
          </DialogTitle>
          <DialogDescription>
            Nodes whose parent no longer exists (or ended up in a different case). Detach to make them a new root, or delete them.
          </DialogDescription>
        </DialogHeader>
        {orphans.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">Nothing to fix — the workspace is consistent.</p>
        ) : (
          <div className="space-y-2 max-h-[50vh] overflow-auto">
            {orphans.map((n) => (
              <div key={n.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{n.title}</div>
                  <div className="text-xs text-muted-foreground truncate">{n.type} · missing parent {n.parent_id}</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onDetach(n.id)}>
                    <Unlink className="h-3 w-3 mr-1" /> Detach
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs text-red-500 hover:text-red-500" onClick={() => onDelete(n.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
