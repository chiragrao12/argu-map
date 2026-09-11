// Server-only AI helpers: Gemini chat + BM25 retrieval.

const KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-3.6-flash';
const BASE = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// This model spends tokens on hidden "thinking" before writing its visible
// answer, and that spend counts against maxOutputTokens — observed eating
// 300-500+ tokens on its own even for simple prompts, silently truncating
// the visible answer (and breaking strict-JSON parsing) if the caller's
// budget doesn't leave enough room. THINKING_BUDGET hints the model down;
// THINKING_BUFFER pads the request budget to comfortably cover it either
// way, so every existing call site's `maxTokens` keeps meaning "budget for
// the answer" without having to be touched individually.
const THINKING_BUDGET = 256;
const THINKING_BUFFER = 768;

export async function chat(system, user, maxTokens = 1400) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': KEY,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        maxOutputTokens: maxTokens + THINKING_BUFFER,
        thinkingConfig: { thinkingBudget: THINKING_BUDGET },
      },
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || 'LLM request failed');
  }
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
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
