// Server-only AI helpers: Claude chat via Emergent Universal Key + BM25 retrieval.

const KEY = process.env.EMERGENT_LLM_KEY;
const BASE = process.env.LLM_BASE_URL || 'https://integrations.emergentagent.com/llm/v1';
const MODEL = 'claude-sonnet-4-5';

export async function chat(system, user, maxTokens = 1400) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || 'LLM request failed');
  }
  return data?.choices?.[0]?.message?.content || '';
}

function tokenize(t) {
  return (t || '').toLowerCase().match(/[a-z0-9]{2,}/g) || [];
}

// Lightweight BM25 ranking over the workspace nodes (our "AI memory" retrieval).
export function retrieve(query, docs, k = 6) {
  const N = docs.length;
  if (!N) return [];
  const tokenized = docs.map((d) => tokenize(d.text));
  const df = {};
  tokenized.forEach((toks) => {
    new Set(toks).forEach((t) => (df[t] = (df[t] || 0) + 1));
  });
  const avgdl = tokenized.reduce((s, t) => s + t.length, 0) / N || 1;
  const k1 = 1.5;
  const b = 0.75;
  const qtoks = [...new Set(tokenize(query))];
  const scored = docs.map((d, i) => {
    const toks = tokenized[i];
    const len = toks.length;
    const tf = {};
    toks.forEach((t) => (tf[t] = (tf[t] || 0) + 1));
    let score = 0;
    qtoks.forEach((t) => {
      if (!tf[t]) return;
      const idf = Math.log(1 + (N - df[t] + 0.5) / (df[t] + 0.5));
      score += idf * ((tf[t] * (k1 + 1)) / (tf[t] + k1 * (1 - b + (b * len) / avgdl)));
    });
    return { ...d, score };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, k);
}
