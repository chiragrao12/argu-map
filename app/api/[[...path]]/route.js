import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/db';
import { chat, retrieve } from '@/lib/ai';

const WS = 'default';
const ARG_TYPES = ['claim', 'premise', 'objection'];

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function clean(doc) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return rest;
}

function segments(request) {
  const { pathname } = new URL(request.url);
  return pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
}

async function computeOutline(db, parent_id) {
  let depth = 1;
  if (parent_id) {
    const parent = await db.collection('nodes').findOne({ id: parent_id });
    const pnum = parent?.outline_number;
    const pdepth = pnum ? parseInt(pnum.split('.')[0], 10) : 1;
    depth = (isNaN(pdepth) ? 1 : pdepth) + 1;
  }
  const count = await db.collection('nodes').countDocuments({
    workspace_id: WS,
    outline_number: { $regex: `^${depth}\\.` },
  });
  return `${depth}.${count + 1}`;
}

async function buildArgumentText(db, rootId) {
  const all = await db.collection('nodes').find({ workspace_id: WS }).toArray();
  const edges = await db.collection('edges').find({ workspace_id: WS }).toArray();
  const byId = {};
  all.forEach((n) => (byId[n.id] = n));
  const childrenOf = {};
  all.forEach((n) => {
    if (n.parent_id) (childrenOf[n.parent_id] = childrenOf[n.parent_id] || []).push(n);
  });
  // also treat edge sources (supports/objects_to) targeting a node as children
  edges.forEach((e) => {
    if ((e.relation === 'supports' || e.relation === 'objects_to') && byId[e.source_id]) {
      const child = byId[e.source_id];
      const arr = (childrenOf[e.target_id] = childrenOf[e.target_id] || []);
      if (!arr.find((c) => c.id === child.id) && child.parent_id !== e.target_id) {
        arr.push({ ...child, _rel: e.relation });
      }
    }
  });
  const seen = new Set();
  const lines = [];
  function walk(id, indent) {
    if (seen.has(id)) return;
    seen.add(id);
    const n = byId[id];
    if (!n) return;
    const tag = n._rel === 'objects_to' || n.type === 'objection' ? 'OBJECTION' : n.type.toUpperCase();
    const num = n.outline_number ? `[${n.outline_number}] ` : '';
    lines.push(`${'  '.repeat(indent)}- (${tag}) ${num}${n.title}: ${n.content || ''}`);
    (childrenOf[id] || []).forEach((c) => walk(c.id, indent + 1));
  }
  walk(rootId, 0);
  return lines.join('\n');
}

export async function GET(request) {
  try {
    const parts = segments(request);
    const db = await getDb();
    if (parts[0] === 'health' || parts.length === 0) return json({ ok: true, service: 'scaffold' });
    if (parts[0] === 'nodes') {
      const nodes = await db.collection('nodes').find({ workspace_id: WS }).toArray();
      return json(nodes.map(clean));
    }
    if (parts[0] === 'edges') {
      const edges = await db.collection('edges').find({ workspace_id: WS }).toArray();
      return json(edges.map(clean));
    }
    return json({ error: 'Not found' }, 404);
  } catch (e) {
    console.error('GET error', e);
    return json({ error: e.message }, 500);
  }
}

export async function POST(request) {
  try {
    const parts = segments(request);
    const db = await getDb();
    const body = await request.json().catch(() => ({}));

    if (parts[0] === 'nodes') {
      const now = new Date().toISOString();
      const type = body.type || 'note';
      let outline_number = null;
      if (ARG_TYPES.includes(type)) outline_number = await computeOutline(db, body.parent_id);
      const node = {
        id: uuidv4(),
        workspace_id: WS,
        title: body.title || 'Untitled',
        content: body.content || '',
        type,
        status: type === 'task' ? body.status || 'todo' : null,
        due_date: body.due_date || null,
        outline_number,
        parent_id: body.parent_id || null,
        position: body.position || { x: 120 + Math.random() * 320, y: 120 + Math.random() * 200 },
        color: body.color || (type === 'objection' ? 'amber' : null),
        created_at: now,
        updated_at: now,
      };
      await db.collection('nodes').insertOne({ ...node });
      return json(node);
    }

    if (parts[0] === 'edges') {
      const relation = body.relation || 'backlink';
      const style = relation === 'objects_to' ? 'dashed' : 'solid';
      const edge = {
        id: uuidv4(),
        workspace_id: WS,
        source_id: body.source_id,
        target_id: body.target_id,
        relation,
        joint_group_id: body.joint_group_id || null,
        style,
      };
      await db.collection('edges').insertOne({ ...edge });
      // For argument relations, re-parent + re-number the source so the outline stays meaningful.
      if (relation === 'supports' || relation === 'objects_to') {
        const src = await db.collection('nodes').findOne({ id: body.source_id });
        if (src && ARG_TYPES.includes(src.type)) {
          const outline_number = await computeOutline(db, body.target_id);
          await db.collection('nodes').updateOne(
            { id: body.source_id },
            { $set: { parent_id: body.target_id, outline_number, updated_at: new Date().toISOString() } }
          );
        }
      }
      return json(edge);
    }

    if (parts[0] === 'ai' && parts[1] === 'chat') {
      const message = body.message || '';
      const nodes = await db.collection('nodes').find({ workspace_id: WS }).toArray();
      const docs = nodes.map((n) => ({
        id: n.id,
        title: n.title,
        num: n.outline_number,
        type: n.type,
        text: `${n.title}\n${n.content || ''}`,
      }));
      let top = retrieve(message, docs, 6);
      if (!top.length || (top[0] && top[0].score === 0)) top = docs.slice(-6);
      const context = top
        .map((d) => `### ${d.num ? '[' + d.num + '] ' : ''}${d.title} (${d.type})\n${d.text}`)
        .join('\n\n');
      const system =
        "You are Scaffold's AI assistant. You have persistent memory of the user's entire thinking workspace (notes, claims, premises, objections, tasks). Answer questions grounded ONLY in the provided workspace context. Reference node titles and outline numbers (e.g. [2.1]) when relevant. If the context does not contain the answer, say so clearly. Be concise and use markdown.";
      const user = `WORKSPACE CONTEXT (retrieved notes):\n${context || '(workspace is empty)'}\n\n---\nUSER QUESTION: ${message}`;
      const answer = await chat(system, user, 1200);
      return json({ answer, sources: top.map((d) => ({ id: d.id, title: d.title, num: d.num })) });
    }

    if (parts[0] === 'ai' && parts[1] === 'critique') {
      const node = await db.collection('nodes').findOne({ id: body.node_id });
      if (!node) return json({ error: 'Node not found' }, 404);
      const argText = await buildArgumentText(db, node.id);
      const system =
        'You are a rigorous analytic-philosophy argument critic. Given a claim and its supporting premises and objections, do the following in clear markdown sections: 1) **Weakest premise** — name the single weakest premise (by its outline number/title) and explain why. 2) **Hidden assumptions** — list unstated assumptions the argument relies on. 3) **Logical gaps / fallacies** — identify any. 4) **Strongest missing objection** — propose one powerful objection not yet present. Be specific and concise. Do not rewrite the argument.';
      const user = `ARGUMENT UNDER REVIEW:\n${argText}`;
      const critique = await chat(system, user, 1400);
      return json({ critique });
    }

    if (parts[0] === 'ai' && parts[1] === 'suggest-objection') {
      const node = await db.collection('nodes').findOne({ id: body.node_id });
      if (!node) return json({ error: 'Node not found' }, 404);
      const argText = await buildArgumentText(db, node.id);
      const system =
        'You are a sharp debate opponent. Given a claim and its premises, propose ONE strong, specific objection that is currently missing. Respond in strict JSON only: {"title": "short objection title (<=8 words)", "content": "2-3 sentence explanation of the objection"}. No markdown, no extra text.';
      const user = `ARGUMENT:\n${argText}`;
      const raw = await chat(system, user, 500);
      let parsed = { title: 'Suggested objection', content: raw };
      try {
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
      } catch (_) {}
      return json({ objection: parsed });
    }

    if (parts[0] === 'seed') {
      await db.collection('nodes').deleteMany({ workspace_id: WS });
      await db.collection('edges').deleteMany({ workspace_id: WS });
      const now = new Date().toISOString();
      const mk = (o) => ({
        workspace_id: WS,
        title: 'Untitled',
        content: '',
        type: 'note',
        status: null,
        due_date: null,
        outline_number: null,
        parent_id: null,
        color: null,
        created_at: now,
        updated_at: now,
        ...o,
      });
      const claim = mk({ id: uuidv4(), type: 'claim', outline_number: '1.1', title: 'AI will transform knowledge work', content: 'Large-scale automation of cognitive tasks is imminent and will reshape how professionals work.', position: { x: 520, y: 60 } });
      const p1 = mk({ id: uuidv4(), type: 'premise', outline_number: '2.1', parent_id: claim.id, title: 'LLMs automate research synthesis', content: 'Modern models can read, summarize and cross-reference large corpora faster than humans.', position: { x: 300, y: 300 } });
      const p2 = mk({ id: uuidv4(), type: 'premise', outline_number: '2.2', parent_id: claim.id, title: 'Agents execute multi-step tasks', content: 'Tool-using agents can complete workflows end-to-end with minimal supervision.', position: { x: 620, y: 300 } });
      const obj = mk({ id: uuidv4(), type: 'objection', outline_number: '2.3', parent_id: claim.id, color: 'amber', title: 'Hallucinations limit reliability', content: 'Unpredictable factual errors make full autonomy risky in high-stakes settings.', position: { x: 900, y: 300 } });
      const note1 = mk({ id: uuidv4(), type: 'note', title: 'Reading list', content: 'Key sources on automation. See [[AI will transform knowledge work]] and [[Productivity gains]].', position: { x: 120, y: 560 } });
      const note2 = mk({ id: uuidv4(), type: 'note', title: 'Productivity gains', content: 'Early studies show 20-40% speedups for writing-heavy tasks. Links back to [[Reading list]].', position: { x: 460, y: 560 } });
      const t1 = mk({ id: uuidv4(), type: 'task', status: 'done', title: 'Draft essay outline', content: 'Sketch the main argument.', due_date: null, position: { x: 120, y: 760 } });
      const t2 = mk({ id: uuidv4(), type: 'task', status: 'in_progress', title: 'Write first section', content: 'Expand premise 2.1.', position: { x: 420, y: 760 } });
      const t3 = mk({ id: uuidv4(), type: 'task', status: 'todo', title: 'Address objection 2.3', content: 'Add reliability discussion.', position: { x: 720, y: 760 } });
      const nodes = [claim, p1, p2, obj, note1, note2, t1, t2, t3];
      await db.collection('nodes').insertMany(nodes.map((n) => ({ ...n })));
      const edge = (s, t, relation, extra = {}) => ({ id: uuidv4(), workspace_id: WS, source_id: s, target_id: t, relation, joint_group_id: null, style: relation === 'objects_to' ? 'dashed' : 'solid', ...extra });
      const jg = uuidv4();
      const edges = [
        edge(p1.id, claim.id, 'supports', { joint_group_id: jg }),
        edge(p2.id, claim.id, 'supports', { joint_group_id: jg }),
        edge(obj.id, claim.id, 'objects_to'),
        edge(note2.id, note1.id, 'backlink'),
        edge(note1.id, note2.id, 'backlink'),
        edge(t1.id, t2.id, 'follow_up'),
        edge(t2.id, t3.id, 'follow_up'),
      ];
      await db.collection('edges').insertMany(edges.map((e) => ({ ...e })));
      return json({ ok: true, nodes: nodes.length, edges: edges.length });
    }

    return json({ error: 'Not found' }, 404);
  } catch (e) {
    console.error('POST error', e);
    return json({ error: e.message }, 500);
  }
}

export async function PUT(request) {
  try {
    const parts = segments(request);
    const db = await getDb();
    const body = await request.json().catch(() => ({}));
    if (parts[0] === 'nodes' && parts[1]) {
      const upd = { ...body, updated_at: new Date().toISOString() };
      delete upd.id;
      delete upd._id;
      delete upd.workspace_id;
      await db.collection('nodes').updateOne({ id: parts[1] }, { $set: upd });
      const n = await db.collection('nodes').findOne({ id: parts[1] });
      return json(clean(n));
    }
    if (parts[0] === 'edges' && parts[1]) {
      const upd = { ...body };
      delete upd.id;
      delete upd._id;
      await db.collection('edges').updateOne({ id: parts[1] }, { $set: upd });
      const e = await db.collection('edges').findOne({ id: parts[1] });
      return json(clean(e));
    }
    return json({ error: 'Not found' }, 404);
  } catch (e) {
    console.error('PUT error', e);
    return json({ error: e.message }, 500);
  }
}

export async function DELETE(request) {
  try {
    const parts = segments(request);
    const db = await getDb();
    if (parts[0] === 'nodes' && parts[1]) {
      await db.collection('nodes').deleteOne({ id: parts[1] });
      await db.collection('edges').deleteMany({ $or: [{ source_id: parts[1] }, { target_id: parts[1] }] });
      return json({ ok: true });
    }
    if (parts[0] === 'edges' && parts[1]) {
      await db.collection('edges').deleteOne({ id: parts[1] });
      return json({ ok: true });
    }
    return json({ error: 'Not found' }, 404);
  } catch (e) {
    console.error('DELETE error', e);
    return json({ error: e.message }, 500);
  }
}
