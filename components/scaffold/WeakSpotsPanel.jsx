'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Target } from 'lucide-react';

export default function WeakSpotsPanel({ open, onOpenChange, onLoad }) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  // `open` is a controlled prop flipped by the parent's header button, not by
  // an internal Dialog gesture — Radix's onOpenChange only fires for the
  // latter, so the load has to be triggered from the prop itself.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setResults(null);
    onLoad().then((res) => {
      if (cancelled) return;
      if (res?.results) setResults(res.results);
      else setError(res?.error || 'Could not analyze this case.');
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, onLoad]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-4 w-4 text-emerald-400" /> Weak spots
          </DialogTitle>
          <DialogDescription>The weakest premise under each claim in the active case, ranked by the AI.</DialogDescription>
        </DialogHeader>
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Analyzing claims…
          </div>
        )}
        {!loading && error && <p className="text-sm text-red-400 py-4">{error}</p>}
        {!loading && !error && results && results.length === 0 && (
          <p className="text-sm text-muted-foreground py-4">No claims with premises in this case yet.</p>
        )}
        {!loading && !error && results && results.length > 0 && (
          <div className="space-y-3 max-h-[60vh] overflow-auto">
            {results.map((r) => (
              <div key={r.claim_id} className="rounded-md border border-border p-3">
                <div className="text-xs font-mono text-muted-foreground mb-1">
                  [{r.claim_outline}] {r.claim_title}
                </div>
                {r.weakest ? (
                  <div className="text-sm">
                    <span className="font-semibold text-amber-400">
                      [{r.weakest.outline}] {r.weakest.title}
                    </span>
                    <p className="text-muted-foreground mt-0.5">{r.weakest.reason}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Could not determine a weakest premise.</p>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
