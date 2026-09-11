'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { FolderOpen, Plus, ChevronDown } from 'lucide-react';

export default function CaseSwitcher({ cases, selectedCaseId, onSelect, onCreate }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const current = cases.find((c) => c.id === selectedCaseId) || null;

  const create = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    const c = await onCreate(title.trim());
    setBusy(false);
    if (c?.id) {
      setTitle('');
      setOpen(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="max-w-[220px]">
            <FolderOpen className="h-4 w-4 mr-1.5 shrink-0" />
            <span className="truncate">{current ? current.title : cases.length ? 'Select a case' : 'No cases yet'}</span>
            <ChevronDown className="h-3.5 w-3.5 ml-1.5 shrink-0 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {cases.map((c) => (
            <DropdownMenuItem key={c.id} onClick={() => onSelect(c.id)} className={c.id === selectedCaseId ? 'bg-muted' : ''}>
              <span className="truncate">{c.title}</span>
            </DropdownMenuItem>
          ))}
          {cases.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> New case
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New case</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            A case is one named argument tree — its own claim, premises, and objections with their own outline numbering.
          </p>
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
            placeholder="e.g. Remote work boosts productivity"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={create} disabled={busy || !title.trim()}>Create case</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
