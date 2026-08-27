'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { Brain, Network, FileText, Share2, ListChecks, Plus, PanelRightClose, PanelRightOpen, Sparkles, Flag, CheckCircle2, AlertTriangle, ListTodo, Search, Wand2, Loader2 } from 'lucide-react';
import CanvasView from '@/components/scaffold/CanvasView';
import GraphView from '@/components/scaffold/GraphView';
import NotesView from '@/components/scaffold/NotesView';
import TimelineView from '@/components/scaffold/TimelineView';
import AIChat from '@/components/scaffold/AIChat';
import NodeEditor from '@/components/scaffold/NodeEditor';

const api = {
  get: (p) => fetchJSON(`/api/${p}`),
  post: (p, b) => fetchJSON(`/api/${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }),
  put: (p, b) => fetchJSON(`/api/${p}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }),
  del: (p) => fetchJSON(`/api/${p}`, { method: 'DELETE' }),
};

async function fetchJSON(url, options = {}, attempts = 3, timeoutMs = 6000) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { cache: 'no-store', ...options, signal: ctrl.signal });
      clearTimeout(t);
      return await res.json();
    } catch (err) {
      clearTimeout(t);
      lastErr = err;
      await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw lastErr;
}

const VIEWS = [
  { key: 'canvas', label: 'Canvas', icon: Network },
  { key: 'notes', label: 'Notes', icon: FileText },
  { key: 'graph', label: 'Graph', icon: Share2 },
  { key: 'timeline', label: 'Rundown', icon: ListChecks },
];

const ADD_TYPES = [
  { type: 'claim', label: 'Claim', icon: Flag },
  { type: 'premise', label: 'Premise', icon: CheckCircle2 },
  { type: 'objection', label: 'Objection', icon: AlertTriangle },
  { type: 'note', label: 'Note', icon: FileText },
  { type: 'task', label: 'Task', icon: ListTodo },
];

function App() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [view, setView] = useState('canvas');
  const [selectedId, setSelectedId] = useState(null);
  const [showAI, setShowAI] = useState(true);
  const [editorNode, setEditorNode] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [focusNodeId, setFocusNodeId] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [structOpen, setStructOpen] = useState(false);
  const [structText, setStructText] = useState('');
  const [structBusy, setStructBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const n = await api.get('nodes');
      const e = await api.get('edges');
      setNodes(Array.isArray(n) ? n : []);
      setEdges(Array.isArray(e) ? e : []);
    } catch (err) {
      console.error('[sf] refresh error', err && err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const jumpToNode = useCallback((node) => {
    setSearchOpen(false);
    setSelectedId(node.id);
    if (node.type === 'note') setView('notes');
    else if (node.type === 'task') setView('timeline');
    else {
      setView('canvas');
      setFocusNodeId(null);
      setTimeout(() => setFocusNodeId(node.id), 50);
    }
  }, []);

  const runStructure = useCallback(async () => {
    if (!structText.trim()) return;
    setStructBusy(true);
    try {
      const res = await api.post('ai/structure', { text: structText });
      if (res?.ok) {
        await refresh();
        setView('canvas');
        setStructOpen(false);
        setStructText('');
        if (res.claim_id) setTimeout(() => setFocusNodeId(res.claim_id), 100);
        toast.success(`Structured: 1 claim, ${res.premises} premises${res.objections ? ', ' + res.objections + ' objections' : ''}`);
      } else {
        toast.error(res?.error || 'Could not structure text');
      }
    } catch (e) {
      toast.error('Structure failed: ' + e.message);
    }
    setStructBusy(false);
  }, [structText, refresh]);

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedId) || null, [nodes, selectedId]);

  const createNode = useCallback(async (type, extra = {}) => {
    const node = await api.post('nodes', { type, ...extra });
    if (node?.id) {
      setNodes((prev) => [...prev, node]);
      setSelectedId(node.id);
      toast.success(`${type} created`);
    }
    return node;
  }, []);

  const updateNode = useCallback(async (id, patch, localOnly = false) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
    if (localOnly) return;
    await api.put(`nodes/${id}`, patch);
  }, []);

  const updatePosition = useCallback((id, position) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, position } : n)));
    api.put(`nodes/${id}`, { position });
  }, []);

  const deleteNode = useCallback(async (id) => {
    setNodes((prev) => prev.filter((n) => n.id !== id));
    setEdges((prev) => prev.filter((e) => e.source_id !== id && e.target_id !== id));
    if (selectedId === id) setSelectedId(null);
    await api.del(`nodes/${id}`);
  }, [selectedId]);

  const createEdge = useCallback(async (payload) => {
    const edge = await api.post('edges', payload);
    if (edge?.id) {
      setEdges((prev) => [...prev, edge]);
      // if it changed numbering/parent on the source, refresh nodes
      if (payload.relation === 'supports' || payload.relation === 'objects_to') await refresh();
    }
    return edge;
  }, [refresh]);

  const openEditor = useCallback((id) => {
    const n = nodes.find((x) => x.id === id);
    if (n) { setEditorNode(n); setEditorOpen(true); setSelectedId(id); }
  }, [nodes]);

  const onEditNode = openEditor;
  const onSelectNode = useCallback((id) => setSelectedId(id), []);

  const seedDemo = async () => {
    setLoading(true);
    await api.post('seed');
    await refresh();
    toast.success('Demo workspace loaded');
  };

  const addObjectionFromAI = async (obj) => {
    if (!selectedNode) return;
    const node = await api.post('nodes', { type: 'objection', title: obj.title, content: obj.content, color: 'amber', parent_id: selectedNode.id, position: { x: (selectedNode.position?.x || 300) + 260, y: (selectedNode.position?.y || 100) + 220 } });
    if (node?.id) {
      await api.post('edges', { source_id: node.id, target_id: selectedNode.id, relation: 'objects_to' });
      await refresh();
      toast.success('Objection added to canvas');
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden">
      <Toaster position="top-center" richColors />
      <header className="h-14 shrink-0 border-b border-border flex items-center gap-3 px-4">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded bg-emerald-500 flex items-center justify-center">
            <Brain className="h-4 w-4 text-slate-950" />
          </div>
          <span className="font-bold tracking-tight">Scaffold</span>
        </div>

        <nav className="flex items-center gap-1 ml-4">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm ${view === v.key ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/60'}`}
            >
              <v.icon className="h-4 w-4" /> {v.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setSearchOpen(true)} className="text-muted-foreground">
            <Search className="h-4 w-4 mr-1" /> Search
            <kbd className="ml-2 hidden md:inline text-[10px] bg-muted px-1.5 py-0.5 rounded border border-border">⌘K</kbd>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setStructOpen(true)}>
            <Wand2 className="h-4 w-4 mr-1" /> AI Structure
          </Button>
          <Button variant="outline" size="sm" onClick={seedDemo}>
            <Sparkles className="h-4 w-4 mr-1" /> Demo
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" /> Add node
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {ADD_TYPES.map((t) => (
                <DropdownMenuItem key={t.type} onClick={() => createNode(t.type, { title: `New ${t.label.toLowerCase()}` })}>
                  <t.icon className="h-4 w-4 mr-2" /> {t.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon" onClick={() => setShowAI((s) => !s)}>
            {showAI ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <main className="flex-1 min-w-0 relative">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 text-sm text-muted-foreground">Loading workspace…</div>
          )}
          {view === 'canvas' && (
            <div className="h-full" onClickCapture={(e) => { const el = e.target.closest?.('[data-id]'); if (el) onSelectNode(el.getAttribute('data-id')); }}>
              <CanvasView
                nodes={nodes}
                edges={edges}
                onCreateEdge={createEdge}
                onUpdatePosition={updatePosition}
                onEditNode={onEditNode}
                onDeleteNode={deleteNode}
                focusNodeId={focusNodeId}
              />
            </div>
          )}
          {view === 'notes' && (
            <NotesView nodes={nodes} onCreate={createNode} onUpdate={updateNode} onDelete={deleteNode} selectedId={selectedId} setSelectedId={setSelectedId} />
          )}
          {view === 'graph' && <GraphView nodes={nodes} edges={edges} />}
          {view === 'timeline' && (
            <TimelineView nodes={nodes} edges={edges} onCreate={createNode} onUpdate={updateNode} onDelete={deleteNode} onCreateEdge={createEdge} />
          )}
        </main>

        {showAI && (
          <aside className="w-[380px] shrink-0 border-l border-border">
            <AIChat selectedNode={selectedNode} onAddObjection={addObjectionFromAI} />
          </aside>
        )}
      </div>

      <NodeEditor node={editorNode} open={editorOpen} onOpenChange={setEditorOpen} onSave={updateNode} />

      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
        <CommandInput placeholder="Search notes, claims, tasks…" />
        <CommandList>
          <CommandEmpty>No matches found.</CommandEmpty>
          {['claim', 'premise', 'objection', 'note', 'task'].map((type) => {
            const items = nodes.filter((n) => n.type === type);
            if (!items.length) return null;
            const label = { claim: 'Claims', premise: 'Premises', objection: 'Objections', note: 'Notes', task: 'Tasks' }[type];
            return (
              <CommandGroup key={type} heading={label}>
                {items.map((n) => (
                  <CommandItem key={n.id} value={`${n.outline_number || ''} ${n.title} ${n.content || ''}`} onSelect={() => jumpToNode(n)}>
                    {n.outline_number && <span className="mr-2 font-mono text-xs text-muted-foreground">[{n.outline_number}]</span>}
                    <span className="truncate">{n.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}
        </CommandList>
      </CommandDialog>

      <Dialog open={structOpen} onOpenChange={setStructOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Wand2 className="h-4 w-4 text-emerald-400" /> AI Auto-Structure</DialogTitle>
            <DialogDescription>Paste a rough paragraph. The AI extracts a claim, its supporting premises, and any objections — then lays them out on the canvas.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={structText}
            onChange={(e) => setStructText(e.target.value)}
            placeholder="e.g. Remote work boosts productivity because people avoid commutes and control their environment, though some argue it hurts collaboration…"
            className="min-h-[160px] text-sm"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setStructOpen(false)} disabled={structBusy}>Cancel</Button>
            <Button onClick={runStructure} disabled={structBusy || !structText.trim()}>
              {structBusy ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Structuring…</> : <>Build argument map</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default App;
