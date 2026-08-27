'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, Eye, Edit3 } from 'lucide-react';
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

export default function NotesView({ nodes, onCreate, onUpdate, onDelete, selectedId, setSelectedId }) {
  const notes = useMemo(() => nodes.filter((n) => n.type === 'note'), [nodes]);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [preview, setPreview] = useState(false);

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
        <div className="p-3 border-b border-border">
          <Button size="sm" className="w-full" onClick={async () => { const n = await onCreate('note', { title: 'New note' }); if (n?.id) setSelectedId(n.id); }}>
            <Plus className="h-4 w-4 mr-1" /> New note
          </Button>
        </div>
        <div className="flex-1 overflow-auto">
          {notes.map((n) => (
            <button
              key={n.id}
              onClick={() => setSelectedId(n.id)}
              className={`w-full text-left px-3 py-2 border-b border-border/50 hover:bg-muted ${selectedId === n.id ? 'bg-muted' : ''}`}
            >
              <div className="text-sm font-medium truncate">{n.title}</div>
              <div className="text-xs text-muted-foreground truncate">{(n.content || '').replace(/[#*\[\]]/g, '').slice(0, 40) || 'Empty'}</div>
            </button>
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
    </div>
  );
}
