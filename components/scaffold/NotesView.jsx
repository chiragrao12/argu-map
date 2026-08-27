'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, Eye, Edit3, Sparkles, Loader2 } from 'lucide-react';
import Markdown from './Markdown';

function renderWithLinks(text, notesByTitle, onOpen) {
  const parts = (text || '').split(/(\[\[[^\]]+\]\])/g);
  return parts.map((p, i) => {
    const m = p.match(/^\[\[([^\]]+)\]\]$/);
    if (m) {
      const title = m[1].trim();
      const target = notesByTitle[title.toLowerCase()];
      return (
        <button
          key={i}
          onClick={() => target && onOpen(target)}
          className={`px-1 rounded ${target ? 'text-sky-400 hover:underline' : 'text-amber-400'}`}
        >
          {title}
        </button>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

export default function NotesView({ nodes, onCreate, onUpdate, onDelete, selectedId, setSelectedId, onSummarize }) {
  const notes = useMemo(() => nodes.filter((n) => n.type === 'note'), [nodes]);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [preview, setPreview] = useState(false);
  const [checked, setChecked] = useState(() => new Set());
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summary, setSummary] = useState('');
  const [summaryBusy, setSummaryBusy] = useState(false);

  const toggleCheck = (id) =>
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const runSummary = async () => {
    const ids = [...checked];
    if (!ids.length) return;
    setSummaryBusy(true);
    setSummary('');
    setSummaryOpen(true);
    try {
      const res = await onSummarize(ids);
      setSummary(res?.summary || res?.error || 'No summary produced.');
    } catch (e) {
      setSummary('Error: ' + e.message);
    }
    setSummaryBusy(false);
  };

  const current = notes.find((n) => n.id === selectedId) || null;

  useEffect(() => {
    if (current) {
      setDraftTitle(current.title);
      setDraftContent(current.content || '');
    }
  }, [current?.id]);

  const notesByTitle = useMemo(() => {
    const m = {};
    notes.forEach((n) => (m[n.title.toLowerCase()] = n.id));
    return m;
  }, [notes]);

  const backlinks = useMemo(() => {
    if (!current) return [];
    const t = current.title.toLowerCase();
    return notes.filter((n) => n.id !== current.id && (n.content || '').toLowerCase().includes(`[[${t}]]`));
  }, [current, notes]);

  const save = () => {
    if (current) onUpdate(current.id, { title: draftTitle, content: draftContent });
  };

  return (
    <div className="h-full flex">
      <div className="w-64 border-r border-border flex flex-col">
        <div className="p-3 border-b border-border space-y-2">
          <Button size="sm" className="w-full" onClick={async () => { const n = await onCreate('note', { title: 'New note' }); if (n?.id) setSelectedId(n.id); }}>
            <Plus className="h-4 w-4 mr-1" /> New note
          </Button>
          {checked.size > 0 && (
            <Button size="sm" variant="outline" className="w-full" onClick={runSummary}>
              <Sparkles className="h-4 w-4 mr-1" /> Summarize {checked.size} selected
            </Button>
          )}
        </div>
        <div className="flex-1 overflow-auto">
          {notes.map((n) => (
            <div
              key={n.id}
              className={`flex items-start gap-2 px-3 py-2 border-b border-border/50 hover:bg-muted cursor-pointer ${selectedId === n.id ? 'bg-muted' : ''}`}
              onClick={() => setSelectedId(n.id)}
            >
              <Checkbox
                className="mt-0.5"
                checked={checked.has(n.id)}
                onCheckedChange={() => toggleCheck(n.id)}
                onClick={(e) => e.stopPropagation()}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{n.title}</div>
                <div className="text-xs text-muted-foreground truncate">{(n.content || '').replace(/[#*\[\]]/g, '').slice(0, 40) || 'Empty'}</div>
              </div>
            </div>
          ))}
          {!notes.length && <p className="p-3 text-xs text-muted-foreground">No notes yet.</p>}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {current ? (
          <>
            <div className="p-3 border-b border-border flex items-center gap-2">
              <Input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} onBlur={save} className="text-base font-semibold border-0 focus-visible:ring-0 px-0" />
              <Button size="sm" variant="ghost" onClick={() => setPreview((p) => !p)}>
                {preview ? <Edit3 className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { onDelete(current.id); setSelectedId(null); }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {preview ? (
                <div>
                  <div className="mb-4 text-sm leading-relaxed whitespace-pre-wrap">{renderWithLinks(draftContent, notesByTitle, setSelectedId)}</div>
                  <Markdown>{draftContent}</Markdown>
                </div>
              ) : (
                <Textarea
                  value={draftContent}
                  onChange={(e) => setDraftContent(e.target.value)}
                  onBlur={save}
                  placeholder="Write markdown. Link notes with [[Note title]]."
                  className="h-full min-h-[300px] font-mono text-sm resize-none"
                />
              )}
            </div>
            <div className="border-t border-border p-3">
              <div className="text-xs font-semibold text-muted-foreground mb-1">Backlinks ({backlinks.length})</div>
              <div className="flex flex-wrap gap-1">
                {backlinks.map((b) => (
                  <button key={b.id} onClick={() => setSelectedId(b.id)} className="text-xs px-2 py-1 rounded bg-muted hover:bg-muted/70">
                    {b.title}
                  </button>
                ))}
                {!backlinks.length && <span className="text-xs text-muted-foreground">No backlinks</span>}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Select or create a note</div>
        )}
      </div>

      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-emerald-400" /> Cluster summary</DialogTitle>
          </DialogHeader>
          {summaryBusy ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
              <Loader2 className="h-4 w-4 animate-spin" /> Summarizing {checked.size} notes…
            </div>
          ) : (
            <Markdown>{summary}</Markdown>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
