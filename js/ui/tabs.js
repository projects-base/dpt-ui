/**
 * Which dashboard panel is visible.
 *
 * It shows and hides; it does not load. Features that need to fill a panel
 * listen for TAB_CHANGED instead, so this module never grows an import for
 * each new tab.
 */
import { el } from '../core/dom.js';
import { EVENTS, emit } from '../core/events.js';

export function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.dash-tab').forEach(btn => btn.classList.remove('active'));

  const panel = document.getElementById(`tab-${tabId}`);
  const btn   = document.querySelector(`.dash-tab[data-tab="${tabId}"]`);
  if (panel) panel.classList.add('active');
  if (btn)   btn.classList.add('active');

  // Features load their own contents; this only reports what became visible.
  emit(EVENTS.TAB_CHANGED, tabId);
}

document.querySelectorAll('.dash-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    // A row without a data-tab is a link out of this app, not a panel. Passing
    // undefined through would clear .active from every tab AND every panel and
    // then activate nothing, leaving the dashboard blank.
    if (btn.dataset.tab) switchTab(btn.dataset.tab);
  });
});

// ── Layout Toggles ─────────────────────────────────────────────────────
