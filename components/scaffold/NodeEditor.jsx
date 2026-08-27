'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { STATUS_META } from './constants';

export default function NodeEditor({ node, open, onOpenChange, onSave }) {
  const [form, setForm] = useState({});

  useEffect(() => {
    if (node) setForm({ ...node });
  }, [node?.id, open]);

  if (!node) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Edit {node.type}{node.outline_number ? ` [${node.outline_number}]` : ''}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Title</Label>
            <Input value={form.title || ''} onChange={(e) => set('title', e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Content</Label>
            <Textarea value={form.content || ''} onChange={(e) => set('content', e.target.value)} className="min-h-[140px] font-mono text-sm" />
          </div>
          {node.type === 'task' && (
            <div className="flex gap-3">
              <div className="flex-1">
                <Label className="text-xs">Status</Label>
                <Select value={form.status || 'todo'} onValueChange={(v) => set('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.keys(STATUS_META).map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label className="text-xs">Due date</Label>
                <Input type="date" value={form.due_date || ''} onChange={(e) => set('due_date', e.target.value)} />
              </div>
            </div>
          )}
          {(node.type === 'objection' || node.type === 'note') && (
            <div>
              <Label className="text-xs">Color</Label>
              <Select value={form.color || 'none'} onValueChange={(v) => set('color', v === 'none' ? null : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Default</SelectItem>
                  <SelectItem value="amber">Amber (sticky)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { onSave(node.id, form); onOpenChange(false); }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
