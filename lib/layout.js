// Pure tidy-tree layout for one case's argument nodes. No DB/framework
// imports, mirrors lib/graph.js.

const ARG_TYPES = ['claim', 'premise', 'objection'];

const outlineCompare = (a, b) =>
  (a.outline_number || '').localeCompare(b.outline_number || '', undefined, { numeric: true });

// Returns { [nodeId]: {x, y} } for every claim/premise/objection in caseId,
// laid out as a simple centered tree: leaves get sequential horizontal
// slots (in outline order), and each internal node is centered over the
// midpoint of its children.
export function tidyLayout(nodes, caseId, opts = {}) {
  const { nodeWidth = 224, hGap = 56, vGap = 160, startX = 80, startY = 80 } = opts;

  const argNodes = nodes.filter((n) => ARG_TYPES.includes(n.type) && n.case_id === caseId);
  const byId = {};
  argNodes.forEach((n) => (byId[n.id] = n));
  const childrenOf = {};
  argNodes.forEach((n) => {
    if (n.parent_id && byId[n.parent_id]) (childrenOf[n.parent_id] = childrenOf[n.parent_id] || []).push(n);
  });
  Object.values(childrenOf).forEach((list) => list.sort(outlineCompare));
  const roots = argNodes.filter((n) => !n.parent_id || !byId[n.parent_id]).sort(outlineCompare);

  let nextSlot = 0;
  const slotX = {};
  const depthOf = {};
  const seen = new Set();

  function place(node, depth) {
    if (seen.has(node.id)) return slotX[node.id];
    seen.add(node.id);
    depthOf[node.id] = depth;
    const kids = childrenOf[node.id] || [];
    if (!kids.length) {
      slotX[node.id] = nextSlot * (nodeWidth + hGap);
      nextSlot += 1;
      return slotX[node.id];
    }
    const childXs = kids.map((k) => place(k, depth + 1));
    slotX[node.id] = (Math.min(...childXs) + Math.max(...childXs)) / 2;
    return slotX[node.id];
  }
  roots.forEach((r) => place(r, 0));

  const out = {};
  argNodes.forEach((n) => {
    out[n.id] = { x: startX + slotX[n.id], y: startY + depthOf[n.id] * vGap };
  });
  return out;
}
