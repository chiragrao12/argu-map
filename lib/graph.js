// Pure graph helpers shared by the API route. No DB/framework imports so
// these stay easy to reason about (and reusable client-side) independently
// of Mongo.

const ARGUMENT_RELATIONS = ['supports', 'objects_to'];

// Would adding an edge sourceId -> targetId close a loop in the argument
// graph? Walk forward from targetId along existing supports/objects_to
// edges (source_id -> target_id); if sourceId is reachable, targetId
// already transitively depends on sourceId, so the new edge would cycle.
export function detectCycle(edges, sourceId, targetId) {
  if (sourceId === targetId) return true;
  const outgoing = {};
  edges.forEach((e) => {
    if (!ARGUMENT_RELATIONS.includes(e.relation)) return;
    (outgoing[e.source_id] = outgoing[e.source_id] || []).push(e.target_id);
  });
  const seen = new Set([targetId]);
  const queue = [targetId];
  while (queue.length) {
    const cur = queue.shift();
    for (const next of outgoing[cur] || []) {
      if (next === sourceId) return true;
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

// Nodes with a parent_id that doesn't resolve to another node in the same
// case (deleted parent, or a parent that ended up in a different case).
export function findOrphans(nodes) {
  const byId = {};
  nodes.forEach((n) => (byId[n.id] = n));
  return nodes.filter((n) => {
    if (!n.parent_id) return false;
    const parent = byId[n.parent_id];
    if (!parent) return true;
    if (n.case_id && parent.case_id && n.case_id !== parent.case_id) return true;
    return false;
  });
}
