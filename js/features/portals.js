/**
 * The practice-site cards: LeetCode and GitHub stats, and saving a site into
 * the knowledge map.
 *
 * The stats calls go to third parties directly rather than through core/http —
 * they are unauthenticated and are not our API.
 */
import { kwFetch } from '../api/knowledge.js';
import { el } from '../core/dom.js';
import { _categories, categoryByKey, initCategories } from '../features/knowledge/categories.js';
import { addNodeToRenderedGraph } from '../features/knowledge/map.js';
import { EVENTS, on } from '../core/events.js';

export const LEETCODE_STATS_API = 'https://leetcode-stats-api.vercel.app';

/**
 * Portal sync buttons are wired through inline onclick, so the event object was
 * being read off the implicit global. Passing it in explicitly keeps the button
 * reference valid and lets these be called from anywhere.
 */

export async function fetchLeetcodeStats(event) {
  const user = el('leetcodeUser').value.trim();
  if (!user) {
    alert('Please enter a LeetCode username');
    return;
  }
  const btn = event?.currentTarget || el('lcSyncBtn');
  await withSyncingButton(btn, async () => {
    const res = await fetch(`${LEETCODE_STATS_API}/${encodeURIComponent(user)}`);
    const data = await res.json().catch(() => null);

    // The mirror reports an unknown user as a GraphQL `errors` array rather
    // than a status field, so check for the payload we actually need.
    if (!res.ok || !data || data.errors || typeof data.totalSolved !== 'number') {
      alert(`Could not load LeetCode stats for "${user}". Check the username is correct.`);
      return;
    }

    el('lcSolved').textContent = data.totalSolved;
    el('lcRank').textContent   = data.ranking ? data.ranking.toLocaleString() : '—';
    el('leetcodeStats').style.display = 'flex';
    localStorage.setItem('dpt_lc_user', user);
  }, 'LeetCode');
}

export async function fetchGithubStats(event) {
  const user = el('githubUser').value.trim();
  if (!user) {
    alert('Please enter a GitHub username');
    return;
  }
  const btn = event?.currentTarget || el('ghSyncBtn');
  await withSyncingButton(btn, async () => {
    const res = await fetch(`https://api.github.com/users/${encodeURIComponent(user)}`);
    if (res.status === 404) {
      alert(`GitHub user "${user}" not found.`);
      return;
    }
    if (res.status === 403) {
      alert('GitHub rate limit reached. Try again in a few minutes.');
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    el('ghRepos').textContent     = data.public_repos ?? 0;
    el('ghFollowers').textContent = data.followers ?? 0;
    el('githubStats').style.display = 'flex';
    localStorage.setItem('dpt_gh_user', user);
  }, 'GitHub');
}

/** Runs `work` with the button showing a busy label, restoring it either way. */

export async function withSyncingButton(btn, work, label) {
  const original = btn ? btn.textContent : null;
  if (btn) { btn.textContent = 'Syncing...'; btn.disabled = true; }
  try {
    await work();
  } catch (e) {
    alert(`Could not reach the ${label} API: ${e.message}`);
  } finally {
    if (btn) { btn.textContent = original || 'Sync Stats'; btn.disabled = false; }
  }
}

// ── System Design Hub ────────────────────────────────────────────────

export function renderPortalCategorySelects() {
  const selects = document.querySelectorAll('.portal-cat-select');
  if (!selects.length) return;

  selects.forEach(sel => {
    const previous = sel.value;
    sel.innerHTML = '';

    if (!_categories.length) {
      const opt = document.createElement('option');
      opt.textContent = 'Loading categories…';
      opt.value = '';
      sel.appendChild(opt);
      sel.disabled = true;
      return;
    }

    _categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.categoryKey;
      opt.textContent = (cat.icon ? cat.icon + ' ' : '') + cat.label;
      sel.appendChild(opt);
    });
    sel.disabled = false;
    if (previous && _categories.some(c => c.categoryKey === previous)) {
      sel.value = previous;
    }
  });
}

/** Saves a portal (or one of its sections) as a node on the knowledge map. */

export async function savePortalToKnowledge(btn, label, url) {
  const card   = btn.closest('.portal-card');
  const select = card.querySelector('.portal-cat-select');
  const status = card.querySelector('.portal-save-status');

  const show = (msg, ok) => {
    status.textContent = msg;
    status.className = 'portal-save-status ' + (ok ? 'ok' : 'fail');
    status.hidden = false;
  };

  if (!_categories.length) {
    // The categories come from the same endpoint as the map itself.
    await initCategories();
    renderPortalCategorySelects();
  }

  const categoryKey = select.value || (_categories[0] && _categories[0].categoryKey);
  if (!categoryKey) {
    show('Could not load your categories. Open the Knowledge Web tab and try again.', false);
    return;
  }

  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    const node = await kwFetch('/nodes', {
      method: 'POST',
      body: { label, url, categoryKey },
    });

    // Keep an already-built graph in step, so switching tabs shows it without
    // a refetch.
    addNodeToRenderedGraph(node);

    const catLabel = (categoryByKey(categoryKey) || {}).label || 'your map';
    show(`Saved "${label}" under ${catLabel}.`, true);
    setTimeout(() => { status.hidden = true; }, 4000);
  } catch (err) {
    show('Could not save: ' + err.message, false);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────


// The category picker on each portal card mirrors the knowledge map's category
// list; re-render whenever that list changes.
on(EVENTS.CATEGORIES_CHANGED, () => { renderPortalCategorySelects(); });
