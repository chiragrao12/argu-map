'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Scale, ListChecks, Table2 } from 'lucide-react';

const TEMPLATES = [
  {
    key: 'toulmin',
    icon: Scale,
    label: 'Toulmin model',
    description: 'Claim, Grounds, Warrant, Backing, and a Rebuttal — the classic structured-argument layout.',
    placeholder: 'e.g. Remote work should be the default',
  },
  {
    key: 'pro-con',
    icon: ListChecks,
    label: 'Pro/Con list',
    description: 'One claim with two supporting premises and two objections, ready to fill in.',
    placeholder: 'e.g. Should we adopt a 4-day work week?',
  },
  {
    key: 'decision-matrix',
    icon: Table2,
    label: 'Decision matrix',
    description: 'A markdown table (options × criteria) added as a note — for comparisons that are tabular, not argumentative.',
    placeholder: 'e.g. Choosing a database',
  },
];

export default function TemplatePicker({ open, onOpenChange, onCreate }) {
  const [active, setActive] = useState(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const close = (o) => {
    onOpenChange(o);
    if (!o) {
      setActive(null);
      setTitle('');
    }
  };

  const create = async () => {
    if (!active || !title.trim() || busy) return;
    setBusy(true);
    const ok = await onCreate(active, title.trim());
    setBusy(false);
    if (ok) close(false);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New from template</DialogTitle>
          <DialogDescription>Start from a structure instead of a blank case.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              className={`w-full text-left rounded-md border px-3 py-2 transition-colors ${
                active === t.key ? 'border-primary bg-muted' : 'border-border hover:bg-muted/50'
              }`}
            >
              <div className="flex items-center gap-2 text-sm font-semibold">
                <t.icon className="h-4 w-4" /> {t.label}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
            </button>
          ))}
        </div>
        {active && (
          <div>
            <Label className="text-xs">{TEMPLATES.find((t) => t.key === active).key === 'decision-matrix' ? 'Title' : 'Claim / decision'}</Label>
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
              placeholder={TEMPLATES.find((t) => t.key === active).placeholder}
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={create} disabled={!active || !title.trim() || busy}>
            {busy ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Creating…</> : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
