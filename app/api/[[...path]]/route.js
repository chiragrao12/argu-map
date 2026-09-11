import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/db';
import { chat, retrieve } from '@/lib/ai';
import { detectCycle } from '@/lib/graph';
import { tidyLayout } from '@/lib/layout';

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

// Sibling-count outline numbering, scoped by parent (and by case for
// root-level argument nodes). Produces real hierarchical numbers like
// "1", "1.1", "1.1.1" instead of a workspace-wide depth counter.
// `excludeId` must be passed when renumbering a node that may already carry
// the parent/case it's being counted against (e.g. re-running this for an
// already-parented node) — otherwise the count query matches the node
// itself and inflates its own number by one.
async function computeOutline(db, parentId, caseId, excludeId = null) {
  if (parentId) {
    const parent = await db.collection('nodes').findOne({ id: parentId });
    const query = { workspace_id: WS, parent_id: parentId };
    if (excludeId) query.id = { $ne: excludeId };
    const count = await db.collection('nodes').countDocuments(query);
    return `${parent?.outline_number || '1'}.${count + 1}`;
  }
  const query = { workspace_id: WS, case_id: caseId, parent_id: null, type: { $in: ARG_TYPES } };
  if (excludeId) query.id = { $ne: excludeId };
  const count = await db.collection('nodes').countDocuments(query);
  return `${count + 1}`;
}

// Promote a node to a root within its case: clears parent_id and assigns a
// fresh root-level outline number. Used both when a parent is deleted
// (its children are promoted rather than left dangling) and by the manual
// "detach" integrity-repair action.
async function detachNode(db, node) {
  const outline_number = ARG_TYPES.includes(node.type) ? await computeOutline(db, null, node.case_id, node.id) : null;
  await db.collection('nodes').updateOne(
    { id: node.id },
    { $set: { parent_id: null, outline_number, updated_at: new Date().toISOString() } }
  );
}

// A joint group of one edge isn't a joint group any more — dissolve it back
// to a plain solo support edge.
async function pruneGroupIfSingleton(db, groupId) {
  if (!groupId) return;
  const members = await db.collection('edges').find({ workspace_id: WS, joint_group_id: groupId }).toArray();
  if (members.length <= 1) {
    await db.collection('edges').updateMany({ workspace_id: WS, joint_group_id: groupId }, { $set: { joint_group_id: null } });
  }
}

// Full-copy snapshot of a case's current nodes + their edges.
async function saveSnapshot(db, caseId, label) {
  const nodes = await db.collection('nodes').find({ workspace_id: WS, case_id: caseId }).toArray();
  const nodeIds = nodes.map((n) => n.id);
  const edges = await db
    .collection('edges')
    .find({ workspace_id: WS, source_id: { $in: nodeIds }, target_id: { $in: nodeIds } })
    .toArray();
  const snap = {
    id: uuidv4(),
    workspace_id: WS,
    case_id: caseId,
    label: label || null,
    created_at: new Date().toISOString(),
    node_count: nodes.length,
    edge_count: edges.length,
    nodes: nodes.map(clean),
    edges: edges.map(clean),
  };
  await db.collection('snapshots').insertOne({ ...snap });
  return snap;
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
    if (parts[0] === 'cases' && parts[1] && parts[2] === 'snapshots') {
      const snaps = await db
        .collection('snapshots')
        .find({ workspace_id: WS, case_id: parts[1] })
        .project({ nodes: 0, edges: 0 })
        .sort({ created_at: -1 })
        .toArray();
      return json(snaps.map(clean));
    }
    if (parts[0] === 'cases' && parts.length === 1) {
      const cases = await db.collection('cases').find({ workspace_id: WS }).toArray();
      return json(cases.map(clean));
    }
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

    if (parts[0] === 'cases' && parts.length === 1) {
      const now = new Date().toISOString();
      const caseDoc = {
        id: uuidv4(),
        workspace_id: WS,
        title: body.title || 'Untitled case',
        description: body.description || '',
        created_at: now,
        updated_at: now,
      };
      await db.collection('cases').insertOne({ ...caseDoc });
      return json(caseDoc);
    }

    if (parts[0] === 'cases' && parts[1] && parts[2] === 'tidy') {
      const caseDoc = await db.collection('cases').findOne({ id: parts[1] });
      if (!caseDoc) return json({ error: 'Case not found' }, 404);
      const nodes = await db.collection('nodes').find({ workspace_id: WS, case_id: parts[1] }).toArray();
      const positions = tidyLayout(nodes, parts[1]);
      const now = new Date().toISOString();
      const ops = Object.entries(positions).map(([id, position]) => ({
        updateOne: { filter: { id }, update: { $set: { position, updated_at: now } } },
      }));
      if (ops.length) await db.collection('nodes').bulkWrite(ops);
      return json({ ok: true, updated: ops.length });
    }

    if (parts[0] === 'cases' && parts[1] && parts[2] === 'snapshots') {
      const caseDoc = await db.collection('cases').findOne({ id: parts[1] });
      if (!caseDoc) return json({ error: 'Case not found' }, 404);
      const snap = await saveSnapshot(db, parts[1], body.label || null);
      return json(clean(snap));
    }

    if (parts[0] === 'snapshots' && parts[1] && parts[2] === 'restore') {
      const snap = await db.collection('snapshots').findOne({ id: parts[1] });
      if (!snap) return json({ error: 'Snapshot not found' }, 404);
      await saveSnapshot(db, snap.case_id, 'Before restore');
      await db.collection('nodes').deleteMany({ workspace_id: WS, case_id: snap.case_id });
      await db.collection('edges').deleteMany({
        workspace_id: WS,
        $or: [{ source_id: { $in: snap.nodes.map((n) => n.id) } }, { target_id: { $in: snap.nodes.map((n) => n.id) } }],
      });
      if (snap.nodes.length) await db.collection('nodes').insertMany(snap.nodes.map((n) => ({ ...n })));
      if (snap.edges.length) await db.collection('edges').insertMany(snap.edges.map((e) => ({ ...e })));
      return json({ ok: true, restored_nodes: snap.nodes.length, restored_edges: snap.edges.length });
    }

    if (parts[0] === 'templates' && parts[1] === 'toulmin') {
      const title = (body.title || 'Untitled argument').trim();
      const now = new Date().toISOString();
      const caseDoc = { id: uuidv4(), workspace_id: WS, title, description: '', created_at: now, updated_at: now };
      await db.collection('cases').insertOne({ ...caseDoc });

      const mk = (o) => ({
        workspace_id: WS,
        content: '',
        status: null,
        due_date: null,
        color: null,
        tags: [],
        created_at: now,
        updated_at: now,
        ...o,
      });

      const claim = mk({
        id: uuidv4(),
        type: 'claim',
        title,
        content: 'State the claim you want to argue for.',
        case_id: caseDoc.id,
        parent_id: null,
        outline_number: await computeOutline(db, null, caseDoc.id),
        position: { x: 540, y: 60 },
      });
      await db.collection('nodes').insertOne({ ...claim });

      const grounds = mk({
        id: uuidv4(),
        type: 'premise',
        title: 'Grounds',
        content: 'The evidence or facts that support the claim.',
        case_id: caseDoc.id,
        parent_id: claim.id,
        tags: ['grounds'],
        outline_number: await computeOutline(db, claim.id, caseDoc.id),
        position: { x: 260, y: 260 },
      });
      await db.collection('nodes').insertOne({ ...grounds });
      await db.collection('edges').insertOne({ id: uuidv4(), workspace_id: WS, source_id: grounds.id, target_id: claim.id, relation: 'supports', joint_group_id: null, style: 'solid' });

      const warrant = mk({
        id: uuidv4(),
        type: 'premise',
        title: 'Warrant',
        content: 'Why the grounds justify the claim.',
        case_id: caseDoc.id,
        parent_id: claim.id,
        tags: ['warrant'],
        outline_number: await computeOutline(db, claim.id, caseDoc.id),
        position: { x: 560, y: 260 },
      });
      await db.collection('nodes').insertOne({ ...warrant });
      await db.collection('edges').insertOne({ id: uuidv4(), workspace_id: WS, source_id: warrant.id, target_id: claim.id, relation: 'supports', joint_group_id: null, style: 'solid' });

      const backing = mk({
        id: uuidv4(),
        type: 'premise',
        title: 'Backing',
        content: 'Further support for the warrant.',
        case_id: caseDoc.id,
        parent_id: warrant.id,
        tags: ['backing'],
        outline_number: await computeOutline(db, warrant.id, caseDoc.id),
        position: { x: 560, y: 420 },
      });
      await db.collection('nodes').insertOne({ ...backing });
      await db.collection('edges').insertOne({ id: uuidv4(), workspace_id: WS, source_id: backing.id, target_id: warrant.id, relation: 'supports', joint_group_id: null, style: 'solid' });

      const rebuttal = mk({
        id: uuidv4(),
        type: 'objection',
        title: 'Rebuttal',
        content: 'Conditions under which the claim would not hold.',
        color: 'amber',
        case_id: caseDoc.id,
        parent_id: claim.id,
        tags: ['rebuttal'],
        outline_number: await computeOutline(db, claim.id, caseDoc.id),
        position: { x: 860, y: 260 },
      });
      await db.collection('nodes').insertOne({ ...rebuttal });
      await db.collection('edges').insertOne({ id: uuidv4(), workspace_id: WS, source_id: rebuttal.id, target_id: claim.id, relation: 'objects_to', joint_group_id: null, style: 'dashed' });

      return json({ case_id: caseDoc.id });
    }

    if (parts[0] === 'templates' && parts[1] === 'pro-con') {
      const title = (body.title || 'Untitled decision').trim();
      const now = new Date().toISOString();
      const caseDoc = { id: uuidv4(), workspace_id: WS, title, description: '', created_at: now, updated_at: now };
      await db.collection('cases').insertOne({ ...caseDoc });

      const mk = (o) => ({
        workspace_id: WS,
        content: '',
        status: null,
        due_date: null,
        color: null,
        tags: [],
        created_at: now,
        updated_at: now,
        ...o,
      });

      const claim = mk({
        id: uuidv4(),
        type: 'claim',
        title,
        content: 'State the decision or position you are weighing.',
        case_id: caseDoc.id,
        parent_id: null,
        outline_number: await computeOutline(db, null, caseDoc.id),
        position: { x: 540, y: 60 },
      });
      await db.collection('nodes').insertOne({ ...claim });

      let px = 200;
      for (let i = 1; i <= 2; i++) {
        const pro = mk({
          id: uuidv4(),
          type: 'premise',
          title: `Pro ${i}`,
          content: 'A reason in favor.',
          case_id: caseDoc.id,
          parent_id: claim.id,
          tags: ['pro'],
          outline_number: await computeOutline(db, claim.id, caseDoc.id),
          position: { x: px, y: 300 },
        });
        await db.collection('nodes').insertOne({ ...pro });
        await db.collection('edges').insertOne({ id: uuidv4(), workspace_id: WS, source_id: pro.id, target_id: claim.id, relation: 'supports', joint_group_id: null, style: 'solid' });
        px += 260;
      }
      let ox = px + 40;
      for (let i = 1; i <= 2; i++) {
        const con = mk({
          id: uuidv4(),
          type: 'objection',
          title: `Con ${i}`,
          content: 'A reason against.',
          color: 'amber',
          case_id: caseDoc.id,
          parent_id: claim.id,
          tags: ['con'],
          outline_number: await computeOutline(db, claim.id, caseDoc.id),
          position: { x: ox, y: 300 },
        });
        await db.collection('nodes').insertOne({ ...con });
        await db.collection('edges').insertOne({ id: uuidv4(), workspace_id: WS, source_id: con.id, target_id: claim.id, relation: 'objects_to', joint_group_id: null, style: 'dashed' });
        ox += 260;
      }

      return json({ case_id: caseDoc.id });
    }

    if (parts[0] === 'templates' && parts[1] === 'decision-matrix') {
      const title = (body.title || 'Untitled decision matrix').trim();
      const now = new Date().toISOString();
      const table = [
        `# Decision Matrix: ${title}`,
        '',
        '| Option | Cost | Time | Quality | Notes |',
        '|---|---|---|---|---|',
        '| Option A |  |  |  |  |',
        '| Option B |  |  |  |  |',
        '| Option C |  |  |  |  |',
      ].join('\n');
      const note = {
        id: uuidv4(),
        workspace_id: WS,
        title,
        content: table,
        type: 'note',
        status: null,
        due_date: null,
        outline_number: null,
        parent_id: null,
        case_id: null,
        position: { x: 120 + Math.random() * 320, y: 120 + Math.random() * 200 },
        color: null,
        tags: ['decision-matrix'],
        created_at: now,
        updated_at: now,
      };
      await db.collection('nodes').insertOne({ ...note });
      return json({ note_id: note.id });
    }

    if (parts[0] === 'nodes' && parts[1] && parts[2] === 'detach') {
      const node = await db.collection('nodes').findOne({ id: parts[1] });
      if (!node) return json({ error: 'Node not found' }, 404);
      await detachNode(db, node);
      const updated = await db.collection('nodes').findOne({ id: parts[1] });
      return json(clean(updated));
    }

    if (parts[0] === 'nodes' && parts.length === 1) {
      const now = new Date().toISOString();
      const type = body.type || 'note';
      let case_id = null;
      let outline_number = null;
      if (ARG_TYPES.includes(type)) {
        if (body.parent_id) {
          const parent = await db.collection('nodes').findOne({ id: body.parent_id });
          if (!parent) return json({ error: 'Parent node not found' }, 404);
          case_id = parent.case_id;
        } else {
          case_id = body.case_id || null;
          if (!case_id) return json({ error: 'case_id is required for a root claim/premise/objection' }, 400);
          const caseDoc = await db.collection('cases').findOne({ id: case_id });
          if (!caseDoc) return json({ error: 'Case not found' }, 404);
        }
        outline_number = await computeOutline(db, body.parent_id || null, case_id);
      }
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
        case_id,
        position: body.position || { x: 120 + Math.random() * 320, y: 120 + Math.random() * 200 },
        color: body.color || (type === 'objection' ? 'amber' : null),
        tags: Array.isArray(body.tags) ? body.tags : [],
        created_at: now,
        updated_at: now,
      };
      await db.collection('nodes').insertOne({ ...node });
      return json(node);
    }

    if (parts[0] === 'edges' && parts[1] === 'group' && parts.length === 2) {
      const edgeIds = Array.isArray(body.edge_ids) ? body.edge_ids : [];
      if (edgeIds.length < 2) return json({ error: 'Select at least 2 edges to group' }, 400);
      const edgesToGroup = await db.collection('edges').find({ workspace_id: WS, id: { $in: edgeIds } }).toArray();
      if (edgesToGroup.length !== edgeIds.length) return json({ error: 'Some edges were not found' }, 404);
      if (!edgesToGroup.every((e) => e.relation === 'supports')) return json({ error: 'Only supports edges can be grouped' }, 400);
      const targets = new Set(edgesToGroup.map((e) => e.target_id));
      if (targets.size !== 1) return json({ error: 'Edges must all point at the same claim' }, 400);
      const oldGroupIds = [...new Set(edgesToGroup.map((e) => e.joint_group_id).filter(Boolean))];
      const gid = uuidv4();
      await db.collection('edges').updateMany({ workspace_id: WS, id: { $in: edgeIds } }, { $set: { joint_group_id: gid } });
      for (const oldGid of oldGroupIds) await pruneGroupIfSingleton(db, oldGid);
      return json({ ok: true, joint_group_id: gid });
    }

    if (parts[0] === 'edges' && parts[1] && parts[2] === 'ungroup') {
      const edge = await db.collection('edges').findOne({ id: parts[1] });
      if (!edge) return json({ error: 'Edge not found' }, 404);
      const oldGid = edge.joint_group_id;
      if (oldGid) {
        await db.collection('edges').updateOne({ id: parts[1] }, { $set: { joint_group_id: null } });
        await pruneGroupIfSingleton(db, oldGid);
      }
      return json({ ok: true });
    }

    if (parts[0] === 'edges' && parts.length === 1) {
      const relation = body.relation || 'backlink';
      const style = relation === 'objects_to' ? 'dashed' : 'solid';

      if (relation === 'supports' || relation === 'objects_to') {
        const [src, tgt] = await Promise.all([
          db.collection('nodes').findOne({ id: body.source_id }),
          db.collection('nodes').findOne({ id: body.target_id }),
        ]);
        if (!src || !tgt) return json({ error: 'Source or target node not found' }, 404);
        if (src.case_id !== tgt.case_id) return json({ error: "Cross-case connections aren't allowed" }, 400);
        const existingEdges = await db.collection('edges').find({ workspace_id: WS }).toArray();
        if (detectCycle(existingEdges, body.source_id, body.target_id)) {
          return json({ error: 'Would create a circular argument' }, 400);
        }
      }

      const STRENGTHS = ['weak', 'moderate', 'strong'];
      const strength = relation === 'supports' ? (STRENGTHS.includes(body.strength) ? body.strength : 'moderate') : null;

      const edge = {
        id: uuidv4(),
        workspace_id: WS,
        source_id: body.source_id,
        target_id: body.target_id,
        relation,
        strength,
        joint_group_id: null,
        style,
      };
      await db.collection('edges').insertOne({ ...edge });
      // For argument relations, re-parent + re-number the source so the outline stays meaningful.
      if (relation === 'supports' || relation === 'objects_to') {
        const src = await db.collection('nodes').findOne({ id: body.source_id });
        if (src && ARG_TYPES.includes(src.type)) {
          const outline_number = await computeOutline(db, body.target_id, src.case_id, src.id);
          await db.collection('nodes').updateOne(
            { id: body.source_id },
            { $set: { parent_id: body.target_id, outline_number, updated_at: new Date().toISOString() } }
          );
        }
      }
      return json(edge);
    }

    if (parts[0] === 'ai' && parts[1] === 'structure') {
      const text = (body.text || '').trim();
      const case_id = body.case_id;
      if (!text) return json({ error: 'No text provided' }, 400);
      if (!case_id) return json({ error: 'case_id is required' }, 400);
      const caseDoc = await db.collection('cases').findOne({ id: case_id });
      if (!caseDoc) return json({ error: 'Case not found' }, 404);
      const system =
        'You are an argument-mapping assistant. Given a rough paragraph, extract its core CLAIM, the PREMISES that support it, and any OBJECTIONS present. Respond in STRICT JSON only (no markdown, no prose): {"claim":{"title":"<=10 words","content":"one sentence"},"premises":[{"title":"<=10 words","content":"one sentence"}],"objections":[{"title":"<=10 words","content":"one sentence"}]}. Provide 2 to 4 premises. Objections may be an empty array.';
      const raw = await chat(system, text, 1000);
      let data;
      try {
        const m = raw.match(/\{[\s\S]*\}/);
        data = JSON.parse(m ? m[0] : raw);
      } catch (_) {
        return json({ error: 'Could not parse AI output', raw }, 502);
      }
      const now = () => new Date().toISOString();
      const baseNode = (o) => ({
        workspace_id: WS,
        title: 'Untitled',
        content: '',
        type: 'note',
        status: null,
        due_date: null,
        outline_number: null,
        parent_id: null,
        case_id: null,
        position: { x: 0, y: 0 },
        color: null,
        created_at: now(),
        updated_at: now(),
        ...o,
      });
      const claim = baseNode({
        id: uuidv4(),
        type: 'claim',
        case_id,
        title: data.claim?.title || 'Claim',
        content: data.claim?.content || '',
        outline_number: await computeOutline(db, null, case_id),
        position: { x: 540, y: 80 },
      });
      await db.collection('nodes').insertOne({ ...claim });
      const premises = Array.isArray(data.premises) ? data.premises.slice(0, 4) : [];
      const objections = Array.isArray(data.objections) ? data.objections.slice(0, 3) : [];
      const createdEdges = [];
      let px = 180;
      for (const p of premises) {
        const node = baseNode({
          id: uuidv4(),
          type: 'premise',
          case_id,
          title: p.title || 'Premise',
          content: p.content || '',
          parent_id: claim.id,
          outline_number: await computeOutline(db, claim.id, case_id),
          position: { x: px, y: 360 },
        });
        await db.collection('nodes').insertOne({ ...node });
        const e = { id: uuidv4(), workspace_id: WS, source_id: node.id, target_id: claim.id, relation: 'supports', joint_group_id: null, style: 'solid' };
        await db.collection('edges').insertOne({ ...e });
        createdEdges.push(e);
        px += 280;
      }
      let ox = px + 40;
      for (const o of objections) {
        const node = baseNode({
          id: uuidv4(),
          type: 'objection',
          case_id,
          color: 'amber',
          title: o.title || 'Objection',
          content: o.content || '',
          parent_id: claim.id,
          outline_number: await computeOutline(db, claim.id, case_id),
          position: { x: ox, y: 360 },
        });
        await db.collection('nodes').insertOne({ ...node });
        const e = { id: uuidv4(), workspace_id: WS, source_id: node.id, target_id: claim.id, relation: 'objects_to', joint_group_id: null, style: 'dashed' };
        await db.collection('edges').insertOne({ ...e });
        ox += 280;
      }
      return json({ ok: true, claim_id: claim.id, premises: premises.length, objections: objections.length });
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

    if (parts[0] === 'ai' && parts[1] === 'rebuttal') {
      const obj = await db.collection('nodes').findOne({ id: body.node_id });
      if (!obj) return json({ error: 'Node not found' }, 404);
      let claimText = '';
      if (obj.parent_id) {
        const claim = await db.collection('nodes').findOne({ id: obj.parent_id });
        if (claim) claimText = `[${claim.outline_number || ''}] ${claim.title}: ${claim.content || ''}`;
      }
      const system =
        'You defend the original claim against a stated objection by drafting a concise rebuttal (a counter-premise). Respond in STRICT JSON only: {"title":"<=10 words","content":"2-3 sentence rebuttal that undercuts the objection"}. No markdown, no extra text.';
      const user = `ORIGINAL CLAIM: ${claimText || '(unknown)'}\nOBJECTION TO REBUT: [${obj.outline_number || ''}] ${obj.title}: ${obj.content || ''}`;
      const raw = await chat(system, user, 500);
      let parsed = { title: 'Rebuttal', content: raw };
      try {
        const m = raw.match(/\{[\s\S]*\}/);
        if (m) parsed = JSON.parse(m[0]);
      } catch (_) {}
      const now = new Date().toISOString();
      const node = {
        id: uuidv4(),
        workspace_id: WS,
        title: parsed.title || 'Rebuttal',
        content: parsed.content || '',
        type: 'premise',
        status: null,
        due_date: null,
        outline_number: await computeOutline(db, obj.id, obj.case_id),
        parent_id: obj.id,
        case_id: obj.case_id,
        position: { x: (obj.position?.x || 300) - 30, y: (obj.position?.y || 300) + 210 },
        color: null,
        created_at: now,
        updated_at: now,
      };
      await db.collection('nodes').insertOne({ ...node });
      const edge = { id: uuidv4(), workspace_id: WS, source_id: node.id, target_id: obj.id, relation: 'objects_to', joint_group_id: null, style: 'dashed' };
      await db.collection('edges').insertOne({ ...edge });
      return json({ node_id: node.id, title: node.title, content: node.content, outline_number: node.outline_number });
    }

    if (parts[0] === 'ai' && parts[1] === 'steelman') {
      const node = await db.collection('nodes').findOne({ id: body.node_id });
      if (!node) return json({ error: 'Node not found' }, 404);
      const argText = await buildArgumentText(db, node.id);
      const system =
        'You steelman arguments: given a claim and its premises/objections, restate the argument in its strongest, most charitable and persuasive form, tightening weak phrasing and making the best possible case for the claim without inventing new premises. Respond in concise markdown (a short paragraph or a few bullets). Do not critique it.';
      const user = `ARGUMENT:\n${argText}`;
      const steelman = await chat(system, user, 900);
      return json({ steelman });
    }

    if (parts[0] === 'ai' && parts[1] === 'crux') {
      const node = await db.collection('nodes').findOne({ id: body.node_id });
      if (!node) return json({ error: 'Node not found' }, 404);
      if (node.type !== 'claim') return json({ error: 'Crux-finder starts from a claim' }, 400);
      const argText = await buildArgumentText(db, node.id);
      const system =
        'You identify the crux of an argument: the single most important piece of evidence or event that, if it occurred or were revealed, would most change whether the claim is true. Respond in STRICT JSON only: {"question":"one sentence, phrased as \'What would change my mind: ...\'","task_title":"<=10 words"}. No markdown, no extra text.';
      const user = `ARGUMENT:\n${argText}`;
      const raw = await chat(system, user, 400);
      let parsed = { question: raw, task_title: 'Find crux evidence' };
      try {
        const m = raw.match(/\{[\s\S]*\}/);
        if (m) parsed = JSON.parse(m[0]);
      } catch (_) {}
      const now = new Date().toISOString();
      const taskNode = {
        id: uuidv4(),
        workspace_id: WS,
        title: parsed.task_title || 'Find crux evidence',
        content: `Crux for [${node.outline_number || ''}] ${node.title}: ${parsed.question || ''}`,
        type: 'task',
        status: 'todo',
        due_date: null,
        outline_number: null,
        parent_id: null,
        case_id: null,
        position: { x: 120 + Math.random() * 320, y: 760 },
        color: null,
        created_at: now,
        updated_at: now,
      };
      await db.collection('nodes').insertOne({ ...taskNode });
      return json({ task_id: taskNode.id, title: taskNode.title, content: taskNode.content, question: parsed.question });
    }

    if (parts[0] === 'ai' && parts[1] === 'weak-links') {
      const case_id = body.case_id;
      if (!case_id) return json({ error: 'case_id is required' }, 400);
      const claims = await db.collection('nodes').find({ workspace_id: WS, case_id, type: 'claim' }).toArray();
      const results = [];
      for (const claim of claims) {
        const premiseCount = await db.collection('nodes').countDocuments({ workspace_id: WS, parent_id: claim.id, type: 'premise' });
        if (!premiseCount) continue;
        const argText = await buildArgumentText(db, claim.id);
        const system =
          'Given a claim and its supporting premises, identify the single weakest premise. Respond in STRICT JSON only: {"outline":"its outline number","title":"its title","reason":"one sentence why it is the weakest"}. No markdown, no extra text.';
        const raw = await chat(system, `ARGUMENT:\n${argText}`, 300);
        let weakest = null;
        try {
          const m = raw.match(/\{[\s\S]*\}/);
          if (m) weakest = JSON.parse(m[0]);
        } catch (_) {}
        results.push({ claim_id: claim.id, claim_title: claim.title, claim_outline: claim.outline_number, weakest });
      }
      return json({ results });
    }

    if (parts[0] === 'ai' && parts[1] === 'debate') {
      const claim = await db.collection('nodes').findOne({ id: body.node_id });
      if (!claim) return json({ error: 'Node not found' }, 404);
      if (claim.type !== 'claim') return json({ error: "Devil's advocate mode starts from a claim" }, 400);
      const rounds = Math.min(3, Math.max(1, parseInt(body.rounds, 10) || 2));

      const createdIds = [];
      let currentParent = claim;
      let roundsCompleted = 0;

      for (let i = 0; i < rounds; i++) {
        const argText = await buildArgumentText(db, claim.id);
        const objSystem =
          "You are a sharp debate opponent running a multi-round devil's-advocate exercise. Given the argument so far (including any prior objections and rebuttals), propose ONE strong, specific NEW objection that directly attacks the most recent rebuttal (or the claim itself if there is no rebuttal yet) without repeating earlier objections. Respond in strict JSON only: {\"title\": \"short objection title (<=8 words)\", \"content\": \"2-3 sentence explanation of the objection\"}. No markdown, no extra text.";
        const objRaw = await chat(objSystem, `ARGUMENT SO FAR:\n${argText}`, 500);
        let objParsed = { title: 'Objection', content: objRaw };
        try {
          const m = objRaw.match(/\{[\s\S]*\}/);
          if (m) objParsed = JSON.parse(m[0]);
        } catch (_) {}

        const now1 = new Date().toISOString();
        const objNode = {
          id: uuidv4(),
          workspace_id: WS,
          title: objParsed.title || 'Objection',
          content: objParsed.content || '',
          type: 'objection',
          status: null,
          due_date: null,
          outline_number: await computeOutline(db, currentParent.id, claim.case_id),
          parent_id: currentParent.id,
          case_id: claim.case_id,
          position: { x: (currentParent.position?.x || 300) + 260, y: (currentParent.position?.y || 100) + 210 },
          color: 'amber',
          created_at: now1,
          updated_at: now1,
        };
        await db.collection('nodes').insertOne({ ...objNode });
        await db.collection('edges').insertOne({
          id: uuidv4(),
          workspace_id: WS,
          source_id: objNode.id,
          target_id: currentParent.id,
          relation: 'objects_to',
          joint_group_id: null,
          style: 'dashed',
        });
        createdIds.push(objNode.id);

        const rebSystem =
          'You defend the original claim against a stated objection by drafting a concise rebuttal (a counter-premise). Respond in STRICT JSON only: {"title":"<=10 words","content":"2-3 sentence rebuttal that undercuts the objection"}. No markdown, no extra text.';
        const rebUser = `ORIGINAL CLAIM: [${claim.outline_number || ''}] ${claim.title}: ${claim.content || ''}\nOBJECTION TO REBUT: [${objNode.outline_number || ''}] ${objNode.title}: ${objNode.content || ''}`;
        const rebRaw = await chat(rebSystem, rebUser, 500);
        let rebParsed = { title: 'Rebuttal', content: rebRaw };
        try {
          const m = rebRaw.match(/\{[\s\S]*\}/);
          if (m) rebParsed = JSON.parse(m[0]);
        } catch (_) {}

        const now2 = new Date().toISOString();
        const rebNode = {
          id: uuidv4(),
          workspace_id: WS,
          title: rebParsed.title || 'Rebuttal',
          content: rebParsed.content || '',
          type: 'premise',
          status: null,
          due_date: null,
          outline_number: await computeOutline(db, objNode.id, claim.case_id),
          parent_id: objNode.id,
          case_id: claim.case_id,
          position: { x: (objNode.position?.x || 300) - 30, y: (objNode.position?.y || 300) + 210 },
          color: null,
          created_at: now2,
          updated_at: now2,
        };
        await db.collection('nodes').insertOne({ ...rebNode });
        await db.collection('edges').insertOne({
          id: uuidv4(),
          workspace_id: WS,
          source_id: rebNode.id,
          target_id: objNode.id,
          relation: 'objects_to',
          joint_group_id: null,
          style: 'dashed',
        });
        createdIds.push(rebNode.id);

        currentParent = rebNode;
        roundsCompleted += 1;
      }

      return json({ rounds_completed: roundsCompleted, node_ids: createdIds });
    }

    if (parts[0] === 'ai' && parts[1] === 'summarize') {
      const ids = Array.isArray(body.node_ids) ? body.node_ids : [];
      if (!ids.length) return json({ error: 'No nodes selected' }, 400);
      const nodes = await db.collection('nodes').find({ workspace_id: WS, id: { $in: ids } }).toArray();
      const text = nodes.map((n) => `### ${n.title}\n${n.content || ''}`).join('\n\n');
      const system =
        "You synthesize a cluster of the user's notes into a concise summary. Produce short markdown with: a 1-2 sentence overview, key themes as bullets, notable connections between the notes, and any open questions. Ground everything strictly in the provided notes.";
      const summary = await chat(system, `NOTES CLUSTER:\n${text}`, 900);
      return json({ summary, count: nodes.length });
    }

    if (parts[0] === 'migrate-cases') {
      const allNodes = await db.collection('nodes').find({ workspace_id: WS }).toArray();
      const targets = allNodes.filter((n) => ARG_TYPES.includes(n.type) && !n.case_id);
      if (!targets.length) return json({ ok: true, created: 0, message: 'Nothing to migrate.' });

      const byId = {};
      allNodes.forEach((n) => (byId[n.id] = n));
      const visited = new Set();
      let created = 0;
      for (const start of targets) {
        if (visited.has(start.id)) continue;
        let root = start;
        while (root.parent_id && byId[root.parent_id]) root = byId[root.parent_id];
        const componentIds = [];
        const stack = [root.id];
        while (stack.length) {
          const cur = stack.pop();
          if (visited.has(cur)) continue;
          visited.add(cur);
          componentIds.push(cur);
          allNodes.filter((x) => x.parent_id === cur).forEach((x) => stack.push(x.id));
        }
        const now = new Date().toISOString();
        const caseDoc = { id: uuidv4(), workspace_id: WS, title: root.title || 'Untitled case', description: '', created_at: now, updated_at: now };
        await db.collection('cases').insertOne({ ...caseDoc });
        await db.collection('nodes').updateMany({ workspace_id: WS, id: { $in: componentIds } }, { $set: { case_id: caseDoc.id } });
        created += 1;
      }
      return json({ ok: true, created });
    }

    if (parts[0] === 'seed') {
      await db.collection('nodes').deleteMany({ workspace_id: WS });
      await db.collection('edges').deleteMany({ workspace_id: WS });
      await db.collection('cases').deleteMany({ workspace_id: WS });
      const now = new Date().toISOString();
      const caseDoc = { id: uuidv4(), workspace_id: WS, title: 'AI will transform knowledge work', description: '', created_at: now, updated_at: now };
      await db.collection('cases').insertOne({ ...caseDoc });
      const mk = (o) => ({
        workspace_id: WS,
        title: 'Untitled',
        content: '',
        type: 'note',
        status: null,
        due_date: null,
        outline_number: null,
        parent_id: null,
        case_id: null,
        color: null,
        created_at: now,
        updated_at: now,
        ...o,
      });
      const claim = mk({ id: uuidv4(), type: 'claim', case_id: caseDoc.id, outline_number: '1', title: 'AI will transform knowledge work', content: 'Large-scale automation of cognitive tasks is imminent and will reshape how professionals work.', position: { x: 520, y: 60 } });
      const p1 = mk({ id: uuidv4(), type: 'premise', case_id: caseDoc.id, outline_number: '1.1', parent_id: claim.id, title: 'LLMs automate research synthesis', content: 'Modern models can read, summarize and cross-reference large corpora faster than humans.', position: { x: 300, y: 300 } });
      const p2 = mk({ id: uuidv4(), type: 'premise', case_id: caseDoc.id, outline_number: '1.2', parent_id: claim.id, title: 'Agents execute multi-step tasks', content: 'Tool-using agents can complete workflows end-to-end with minimal supervision.', position: { x: 620, y: 300 } });
      const obj = mk({ id: uuidv4(), type: 'objection', case_id: caseDoc.id, outline_number: '1.3', parent_id: claim.id, color: 'amber', title: 'Hallucinations limit reliability', content: 'Unpredictable factual errors make full autonomy risky in high-stakes settings.', position: { x: 900, y: 300 } });
      const note1 = mk({ id: uuidv4(), type: 'note', title: 'Reading list', content: 'Key sources on automation. See [[AI will transform knowledge work]] and [[Productivity gains]].', position: { x: 120, y: 560 } });
      const note2 = mk({ id: uuidv4(), type: 'note', title: 'Productivity gains', content: 'Early studies show 20-40% speedups for writing-heavy tasks. Links back to [[Reading list]].', position: { x: 460, y: 560 } });
      const t1 = mk({ id: uuidv4(), type: 'task', status: 'done', title: 'Draft essay outline', content: 'Sketch the main argument.', due_date: null, position: { x: 120, y: 760 } });
      const t2 = mk({ id: uuidv4(), type: 'task', status: 'in_progress', title: 'Write first section', content: 'Expand premise 1.1.', position: { x: 420, y: 760 } });
      const t3 = mk({ id: uuidv4(), type: 'task', status: 'todo', title: 'Address objection 1.3', content: 'Add reliability discussion.', position: { x: 720, y: 760 } });
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
      return json({ ok: true, case_id: caseDoc.id, nodes: nodes.length, edges: edges.length });
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
    if (parts[0] === 'cases' && parts[1]) {
      const upd = { ...body, updated_at: new Date().toISOString() };
      delete upd.id;
      delete upd._id;
      delete upd.workspace_id;
      await db.collection('cases').updateOne({ id: parts[1] }, { $set: upd });
      const c = await db.collection('cases').findOne({ id: parts[1] });
      return json(clean(c));
    }
    if (parts[0] === 'nodes' && parts[1]) {
      const upd = { ...body, updated_at: new Date().toISOString() };
      delete upd.id;
      delete upd._id;
      delete upd.workspace_id;
      // Structural fields (case_id, parent_id) must stay consistent with
      // outline_number; only the dedicated edge/detach flows should change
      // them, not a generic field patch.
      delete upd.case_id;
      delete upd.parent_id;
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
    if (parts[0] === 'cases' && parts[1]) {
      const nodeIds = (await db.collection('nodes').find({ workspace_id: WS, case_id: parts[1] }).project({ id: 1 }).toArray()).map((n) => n.id);
      await db.collection('edges').deleteMany({ workspace_id: WS, $or: [{ source_id: { $in: nodeIds } }, { target_id: { $in: nodeIds } }] });
      await db.collection('nodes').deleteMany({ workspace_id: WS, case_id: parts[1] });
      await db.collection('cases').deleteOne({ id: parts[1] });
      await db.collection('snapshots').deleteMany({ workspace_id: WS, case_id: parts[1] });
      return json({ ok: true });
    }
    if (parts[0] === 'nodes' && parts[1]) {
      const touchingEdges = await db
        .collection('edges')
        .find({ workspace_id: WS, $or: [{ source_id: parts[1] }, { target_id: parts[1] }] })
        .toArray();
      const affectedGroups = [...new Set(touchingEdges.map((e) => e.joint_group_id).filter(Boolean))];

      await db.collection('nodes').deleteOne({ id: parts[1] });
      await db.collection('edges').deleteMany({ $or: [{ source_id: parts[1] }, { target_id: parts[1] }] });

      // Promote former children to roots instead of leaving them orphaned.
      const children = await db.collection('nodes').find({ workspace_id: WS, parent_id: parts[1] }).toArray();
      for (const child of children) await detachNode(db, child);

      for (const gid of affectedGroups) await pruneGroupIfSingleton(db, gid);

      return json({ ok: true });
    }
    if (parts[0] === 'edges' && parts[1]) {
      const edge = await db.collection('edges').findOne({ id: parts[1] });
      await db.collection('edges').deleteOne({ id: parts[1] });
      if (edge?.joint_group_id) await pruneGroupIfSingleton(db, edge.joint_group_id);
      return json({ ok: true });
    }
    return json({ error: 'Not found' }, 404);
  } catch (e) {
    console.error('DELETE error', e);
    return json({ error: e.message }, 500);
  }
}
