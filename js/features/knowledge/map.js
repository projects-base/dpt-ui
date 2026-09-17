/**
 * The vis-network canvas: building it, painting a graph into it, and adding or
 * removing nodes.
 *
 * It owns the DataSets. Other modules ask it to change the graph rather than
 * mutating them, so only this file knows the vis-network node shape.
 */
import { kwFetch } from '../../api/knowledge.js';
import { EVENTS, emit, on } from '../../core/events.js';
import { escapeHtml } from '../../core/dom.js';
import { KW_CAT_KEY, _categories, categoryByKey, renderCategoryPills } from './categories.js';
import { closeKwPanel, openKwPanel } from './panel.js';
import { log } from '../../core/log.js';

export let network = null;

export let nodes   = null;

export let edges   = null;

export let _selectedNodeId = null;

export const KW_STORAGE_KEY  = 'dpt_knowledge_web';

export const KW_MIGRATED_KEY = 'dpt_kw_migrated';

export const ROOT_STYLE = {
  shape: 'ellipse',
  size: 28,
  color: {
    background: '#6366f1', border: '#4f46e5',
    highlight: { background: '#7c3aed', border: '#6d28d9' },
  },
  font: { color: 'white', size: 14, bold: true },
};

export const FALLBACK_COLORS = { bg: '#1e1b4b', border: '#3730a3', font: '#a5b4fc' };

export function toVisNode(node) {
  const label = (node.icon ? node.icon + ' ' : '') + node.label;

  if (node.kind === 'ROOT') {
    // kind must survive onto the vis node: the click handler and the delete
    // guard both read it to keep the root from being removed.
    return { id: node.nodeKey, label, kind: node.kind, ...ROOT_STYLE };
  }

  const cat = categoryByKey(node.categoryKey);
  const bg     = (cat && cat.colorBg)     || FALLBACK_COLORS.bg;
  const border = (cat && cat.colorBorder) || FALLBACK_COLORS.border;
  const font   = (cat && cat.colorFont)   || FALLBACK_COLORS.font;

  return {
    id: node.nodeKey,
    label,
    shape: 'box',
    color: { background: bg, border },
    font: { color: font, size: node.kind === 'PILLAR' ? 13 : 12 },
    url: node.url || undefined,
    kind: node.kind,
    desc: cat ? node.label + ' — ' + cat.label : node.label,
  };
}

// ── API ────────────────────────────────────────────────────────────

/**
 * The knowledge map's corner of the API. This was a hand-written copy of
 * apiFetch before apiFetch existed; now it only supplies the path prefix.
 *
 * Note bodies are plain objects here — apiFetch serialises them.
 */

export async function migrateLocalGraph() {
  if (localStorage.getItem(KW_MIGRATED_KEY)) return null;

  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(KW_STORAGE_KEY) || 'null'); } catch (_) {}
  if (!stored || !Array.isArray(stored.nodes) || stored.nodes.length === 0) {
    localStorage.setItem(KW_MIGRATED_KEY, '1');
    return null;
  }

  let localCats = [];
  try { localCats = JSON.parse(localStorage.getItem(KW_CAT_KEY) || '[]'); } catch (_) {}

  // The old format kept colours on each node and category ids on a separate
  // list, with numeric vis ids. Flatten it into what the API accepts.
  const catByPillar = new Map();
  const categories = localCats.map(c => {
    if (c.pillarId != null) catByPillar.set(String(c.pillarId), c.id);
    return {
      categoryKey: c.id,
      label: (c.label || '').replace(/^\S+\s/, '') || c.id,
      icon: c.icon || '📌',
      pillarNodeKey: String(c.pillarId),
      colorBg: c.bg, colorBorder: c.border, colorFont: c.font,
      builtIn: false,
    };
  });

  const edgeList = (stored.edges || [])
    .filter(e => e && e.from != null && e.to != null)
    .map(e => ({ from: String(e.from), to: String(e.to) }));

  // A node's category is whichever pillar points at it.
  const parentOf = new Map();
  edgeList.forEach(e => parentOf.set(e.to, e.from));

  const nodeList = stored.nodes.filter(n => n && n.id != null).map(n => {
    const key = String(n.id);
    const rawLabel = n.label || '';
    const iconMatch = rawLabel.match(/^(\S+)\s+(.*)$/);
    const icon  = iconMatch ? iconMatch[1] : null;
    const label = iconMatch ? iconMatch[2] : rawLabel;

    let kind = 'RESOURCE';
    if (n.shape === 'ellipse' || key === '1') kind = 'ROOT';
    else if (catByPillar.has(key) || !parentOf.has(key)) kind = 'PILLAR';

    return {
      nodeKey: key,
      label: label || key,
      icon,
      url: n.url || null,
      categoryKey: catByPillar.get(parentOf.get(key)) || catByPillar.get(key) || null,
      kind,
      notes: n.desc || null,
    };
  });

  try {
    const result = await kwFetch('/import', {
      method: 'POST',
      body: { nodes: nodeList, edges: edgeList, categories },
    });
    localStorage.setItem(KW_MIGRATED_KEY, '1');
    log(result.imported
      ? `Migrated ${nodeList.length} knowledge nodes from this browser to your account.`
      : 'Your account already has a knowledge map; this browser copy was left alone.');
    return result.graph;
  } catch (err) {
    // Leave the flag unset so it is retried next time.
    log('Knowledge migration failed: ' + err.message, true);
    return null;
  }
}

// ── Categories ─────────────────────────────────────────────────────

export function applyGraph(graph) {
  _categories = graph.categories || [];
  renderCategoryPills();
  emit(EVENTS.CATEGORIES_CHANGED);

  const visNodes = (graph.nodes || []).map(toVisNode);
  const visEdges = (graph.edges || []).map(e => ({ from: e.from, to: e.to }));

  if (nodes && edges) {
    nodes.clear(); edges.clear();
    nodes.add(visNodes); edges.add(visEdges);
    return;
  }

  nodes = new vis.DataSet(visNodes);
  edges = new vis.DataSet(visEdges);

  const container = document.getElementById('knowledgeNetwork');
  if (!container) return;

  const options = {
    nodes: {
      shadow: { enabled: true, size: 8, x: 2, y: 2 },
      borderWidth: 2,
      margin: { top: 8, right: 12, bottom: 8, left: 12 },
    },
    edges: {
      width: 1.5,
      smooth: { type: 'cubicBezier', forceDirection: 'none', roundness: 0.4 },
      color: { color: 'rgba(255,255,255,0.15)', highlight: '#6366f1', hover: '#a5b4fc' },
      arrows: { to: { enabled: true, scaleFactor: 0.5 } },
    },
    physics: {
      enabled: true,
      stabilization: { iterations: 120 },
      barnesHut: { springLength: 180, springConstant: 0.04, damping: 0.2 },
    },
    interaction: { hover: true, tooltipDelay: 150, zoomView: true, dragView: true },
  };

  network = new vis.Network(container, { nodes, edges }, options);

  network.on('click', function (params) {
    const deleteBtn = document.getElementById('deleteNodeBtn');
    if (params.nodes.length > 0) {
      _selectedNodeId = params.nodes[0];
      const nodeData = nodes.get(_selectedNodeId);
      if (deleteBtn) deleteBtn.disabled = nodeData.kind === 'ROOT';
      if (nodeData.url) {
        openKwPanel(nodeData);
      } else {
        closeKwPanel();
      }
    } else {
      _selectedNodeId = null;
      if (deleteBtn) deleteBtn.disabled = true;
      closeKwPanel();
    }
  });
}

export async function reloadGraph() {
  const graph = await kwFetch('');
  applyGraph(graph);
  return graph;
}

/** Called when the Knowledge tab is first opened. */

export async function initKnowledgeWeb() {
  if (network) return;
  try {
    const migrated = await migrateLocalGraph();
    applyGraph(migrated || await kwFetch(''));
  } catch (err) {
    log('Could not load the knowledge map: ' + err.message, true);
    const container = document.getElementById('knowledgeNetwork');
    if (container && !network) {
      container.innerHTML =
        `<p class="qv-placeholder" style="padding:24px;">Could not load your knowledge map.<br>` +
        `${escapeHtml(err.message)}</p>`;
    }
  }
}

/** Loads the category pills without building the graph, for a first paint. */

export async function deleteSelectedNode() {
  if (_selectedNodeId === null) return;

  const nodeData = nodes.get(_selectedNodeId);
  if (!nodeData) return;

  if (nodeData.kind === 'ROOT') {
    alert('The root node cannot be deleted.');
    return;
  }

  const isPillar = nodeData.kind === 'PILLAR';
  const question = isPillar
    ? `Delete the "${nodeData.label}" branch and everything filed under it?`
    : `Delete "${nodeData.label}" from your knowledge map?`;
  if (!confirm(question)) return;

  const btn = document.getElementById('deleteNodeBtn');
  if (btn) btn.disabled = true;

  try {
    await kwFetch(`/nodes/${encodeURIComponent(_selectedNodeId)}`, { method: 'DELETE' });
    _selectedNodeId = null;
    closeKwPanel();
    // Deleting a branch also removes its category and children, so take the
    // server's version rather than guessing at the local effect.
    await reloadGraph();
  } catch (err) {
    alert('Could not delete: ' + err.message);
    if (btn) btn.disabled = false;
  }
}

export async function addKnowledgeNode() {
  const linkEl  = document.getElementById('kwLinkInput');
  const labelEl = document.getElementById('kwLabelInput');
  const link  = linkEl.value.trim();
  const label = labelEl.value.trim();

  if (!label) {
    alert('Please give this node a label.');
    labelEl.focus();
    return;
  }

  const activePill = document.querySelector('.kap-pill.active');
  const categoryKey = activePill
    ? activePill.dataset.value
    : (_categories[0] && _categories[0].categoryKey);

  if (!categoryKey) {
    alert('Open the Knowledge Web tab first so your categories can load.');
    return;
  }

  const btn = document.querySelector('.kap-submit');
  const originalHtml = btn ? btn.innerHTML : null;
  if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }

  try {
    const node = await kwFetch('/nodes', {
      method: 'POST',
      body: { label, url: link || null, categoryKey },
    });

    // Splice the new node in rather than refetching the whole map, so the
    // graph does not visibly re-stabilise on every add.
    if (nodes && edges) {
      nodes.add(toVisNode(node));
      const cat = categoryByKey(node.categoryKey);
      if (cat && cat.pillarNodeKey) {
        edges.add({ from: cat.pillarNodeKey, to: node.nodeKey });
      }
    }

    linkEl.value = '';
    labelEl.value = '';
    labelEl.focus();
  } catch (err) {
    alert('Could not add node: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      if (originalHtml !== null) btn.innerHTML = originalHtml;
    }
  }
}


// ── Learning portals → Knowledge Web ───────────────────────────────
//
// AlgoMaster and takeUforward both refuse to be framed
// (X-Frame-Options: SAMEORIGIN, and CSP frame-ancestors 'self'), so the cards
// deep-link out. What we can do in-app is let a portal be filed straight into
// the user's knowledge map.

/** Fills every portal card's category picker from the loaded categories. */


// Adding a category server-side creates its pillar node, so the graph has to be
// pulled again. categories.js announces that rather than reaching in here.
on(EVENTS.GRAPH_RELOAD, () => { reloadGraph(); });

/**
 * Adds a node to an already-rendered graph, linking it to its category pillar.
 *
 * Callers used to reach in and mutate the `nodes` and `edges` DataSets
 * themselves, which meant every one of them had to know the vis-network shape
 * and remember the pillar edge. They ask for this instead.
 *
 * No-op when the map has never been opened — there is nothing to keep in step,
 * and the server already has the node.
 */
export function addNodeToRenderedGraph(node) {
  if (!nodes || !edges) return false;
  nodes.add(toVisNode(node));
  const cat = categoryByKey(node.categoryKey);
  if (cat && cat.pillarNodeKey) {
    edges.add({ from: cat.pillarNodeKey, to: node.nodeKey });
  }
  return true;
}
