'use client';

import { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Sparkles, Bug, Loader2, Brain } from 'lucide-react';
import Markdown from './Markdown';

export default function AIChat({ selectedNode, onAddObjection }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hi! I'm your workspace memory. Ask me things like *\"what have I written about X\"*, or select a claim and hit **Critique** to find its weakest premise." },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const push = (m) => setMessages((prev) => [...prev, m]);

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    push({ role: 'user', content: q });
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q }),
      }).then((r) => r.json());
      push({ role: 'assistant', content: res.answer || res.error || 'No response', sources: res.sources });
    } catch (e) {
      push({ role: 'assistant', content: 'Error: ' + e.message });
    }
    setLoading(false);
  };

  const critique = async () => {
    if (!selectedNode || loading) return;
    push({ role: 'user', content: `🔍 Critique argument: ${selectedNode.outline_number ? '[' + selectedNode.outline_number + '] ' : ''}${selectedNode.title}` });
    setLoading(true);
    try {
      const res = await fetch('/api/ai/critique', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_id: selectedNode.id }),
      }).then((r) => r.json());
      push({ role: 'assistant', content: res.critique || res.error || 'No response' });
    } catch (e) {
      push({ role: 'assistant', content: 'Error: ' + e.message });
    }
    setLoading(false);
  };

  const suggestObjection = async () => {
    if (!selectedNode || loading) return;
    push({ role: 'user', content: `💡 Suggest a missing objection to: ${selectedNode.title}` });
    setLoading(true);
    try {
      const res = await fetch('/api/ai/suggest-objection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_id: selectedNode.id }),
      }).then((r) => r.json());
      const o = res.objection;
      if (o) {
        push({ role: 'assistant', content: `**${o.title}**\n\n${o.content}`, objection: o });
      } else {
        push({ role: 'assistant', content: res.error || 'No response' });
      }
    } catch (e) {
      push({ role: 'assistant', content: 'Error: ' + e.message });
    }
    setLoading(false);
  };

  const isArg = selectedNode && ['claim', 'premise', 'objection'].includes(selectedNode.type);

  return (
    <div className="h-full flex flex-col bg-sidebar">
      <div className="p-3 border-b border-border flex items-center gap-2">
        <Brain className="h-4 w-4 text-emerald-400" />
        <span className="font-semibold text-sm">Workspace AI</span>
        <span className="ml-auto text-[10px] text-muted-foreground">Claude · memory on</span>
      </div>

      <div className="px-3 py-2 border-b border-border flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={!isArg || loading} onClick={critique} className="h-7 text-xs">
          <Bug className="h-3 w-3 mr-1" /> Critique
        </Button>
        <Button size="sm" variant="outline" disabled={!isArg || loading} onClick={suggestObjection} className="h-7 text-xs">
          <Sparkles className="h-3 w-3 mr-1" /> Suggest objection
        </Button>
      </div>
      {selectedNode ? (
        <div className="px-3 py-1.5 text-[11px] text-muted-foreground border-b border-border truncate">
          Selected: {selectedNode.outline_number ? `[${selectedNode.outline_number}] ` : ''}{selectedNode.title}
        </div>
      ) : (
        <div className="px-3 py-1.5 text-[11px] text-muted-foreground border-b border-border">Select a node to enable critique</div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-auto p-3 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[92%] rounded-lg px-3 py-2 ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
              <Markdown>{m.content}</Markdown>
              {m.objection && (
                <Button size="sm" className="mt-2 h-7 text-xs" onClick={() => onAddObjection(m.objection)}>
                  + Add as objection
                </Button>
              )}
              {m.sources?.length ? (
                <div className="mt-2 pt-2 border-t border-border/50 flex flex-wrap gap-1">
                  {m.sources.map((s) => (
                    <span key={s.id} className="text-[10px] px-1.5 py-0.5 rounded bg-background/60">
                      {s.num ? `[${s.num}] ` : ''}{s.title}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-lg px-3 py-2 bg-muted flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-border flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Ask your workspace…"
          disabled={loading}
        />
        <Button size="icon" onClick={send} disabled={loading}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
