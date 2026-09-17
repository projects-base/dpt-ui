/**
 * The knowledge map's categories: the pill row, and creating one.
 *
 * Split from the map itself because the two change for different reasons — the
 * pills are a form, the map is a vis-network canvas. It announces
 * CATEGORIES_CHANGED rather than calling the things that care.
 */
import { kwFetch } from '../../api/knowledge.js';
import { EVENTS, emit } from '../../core/events.js';

export let _categories = [];

// Legacy localStorage keys: read once for migration, then left alone.

export const KW_CAT_KEY      = 'dpt_kw_categories';

export function categoryByKey(key) {
  return _categories.find(c => c.categoryKey === key) || null;
}

export function renderCategoryPills() {
  const container = document.getElementById('kwCategoryPills');
  if (!container) return;

  const activePill = document.querySelector('.kap-pill.active');
  const activeVal  = activePill
    ? activePill.dataset.value
    : (_categories[0] ? _categories[0].categoryKey : null);

  container.innerHTML = '';
  _categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'kap-pill' + (cat.categoryKey === activeVal ? ' active' : '');
    btn.dataset.value = cat.categoryKey;
    btn.textContent = (cat.icon ? cat.icon + ' ' : '') + cat.label;
    btn.onclick = () => selectKapPill(btn);
    container.appendChild(btn);
  });

  const addBtn = document.createElement('button');
  addBtn.className = 'kap-pill--add';
  addBtn.textContent = '+ New';
  addBtn.onclick = showNewCategoryInput;
  container.appendChild(addBtn);
}

export function showNewCategoryInput() {
  const row = document.getElementById('kapNewCatRow');
  if (row) {
    row.style.display = 'flex';
    document.getElementById('kapNewCatInput').focus();
  }
}

export function cancelNewCategory() {
  const row = document.getElementById('kapNewCatRow');
  if (row) row.style.display = 'none';
  document.getElementById('kapNewCatInput').value = '';
}

export async function confirmNewCategory() {
  const input = document.getElementById('kapNewCatInput');
  const name  = (input.value || '').trim();
  if (!name) { input.focus(); return; }

  try {
    const cat = await kwFetch('/categories', {
      method: 'POST',
      body: { label: name, icon: '📌' },
    });

    _categories.push(cat);
    renderCategoryPills();
    emit(EVENTS.CATEGORIES_CHANGED, _categories);

    // The server created this category's pillar node too — ask for the graph
    // to be pulled again so the new branch appears without a page reload.
    emit(EVENTS.GRAPH_RELOAD);

    const newPill = document.querySelector(`.kap-pill[data-value="${cat.categoryKey}"]`);
    if (newPill) selectKapPill(newPill);

    cancelNewCategory();
  } catch (err) {
    alert('Could not add category: ' + err.message);
    input.select();
  }
}

export function selectKapPill(btn) {
  document.querySelectorAll('.kap-pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
}

// ── Graph ──────────────────────────────────────────────────────────

/**
 * Replaces the category list and repaints anything showing it.
 *
 * This exists because `_categories` is exported, and an exported binding is
 * read-only to whoever imports it — `map.js` assigning to it threw
 * "Assignment to constant variable" and took the whole Knowledge tab with it.
 * That worked when both files were one script sharing a global; it stopped the
 * moment they became modules.
 *
 * So the state stays owned here and callers ask for the change, which is what
 * they wanted anyway: they have a graph, not an opinion about a variable.
 */
export function setCategories(list) {
  _categories = list || [];
  renderCategoryPills();
  emit(EVENTS.CATEGORIES_CHANGED, _categories);
}

/** Loads the categories on their own, so the pills paint before the graph does. */
export async function initCategories() {
  if (_categories.length) { renderCategoryPills(); return; }
  try {
    const graph = await kwFetch('');
    setCategories(graph.categories);
  } catch (_) {
    // The graph loader will surface the error; pills can wait.
  }
}

/*
 * Hosts that refuse to be framed, so the panel can go straight to its
 * "open externally" state instead of showing Chrome's "refused to connect"
 * for several seconds first.
 *
 * Verified response headers:
 *   algomaster.io    X-Frame-Options: SAMEORIGIN
 *   takeuforward.org Content-Security-Policy: frame-ancestors 'self'
 * The rest are long-standing, well-known cases.
 */
