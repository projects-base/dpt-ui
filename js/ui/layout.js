/**
 * Chrome that is not a tab: the collapsible sidebar and the assistant panel,
 * including its drag-to-resize width and the remembered value.
 *
 * Owns no data. Any feature may move the furniture; none of them needs to know
 * how the furniture works.
 */
import { v } from '../core/dom.js';

export function toggleLeftSidebar() {
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) sidebar.classList.toggle('collapsed');
}

export function toggleAIChat() {
  const rs = v('rightSidebar');
  rs.classList.toggle('collapsed');
  if (!rs.classList.contains('collapsed')) {
    applyAiWidth(loadAiWidth());
    // Focus the composer so a mock interview can start typing straight away.
    const input = v('geminiChatInput');
    if (input) setTimeout(() => input.focus(), 320);
  }
}

// ── Resizable AI panel ─────────────────────────────────────────────
// A 340px column is too narrow to hold a mock-interview conversation. The
// panel can be dragged wider, snapped to a wide preset, and remembers the
// width per browser.

export const AI_WIDTH_KEY = 'dpt_ai_panel_width';

export const AI_WIDTH_MIN = 300;

export const AI_WIDTH_DEFAULT = 340;

/** Upper bound: never let the panel crowd out the main content entirely. */

export function aiWidthMax() {
  return Math.max(AI_WIDTH_MIN, Math.min(920, Math.round(window.innerWidth * 0.75)));
}

export function clampAiWidth(px) {
  return Math.min(aiWidthMax(), Math.max(AI_WIDTH_MIN, Math.round(px)));
}

export function loadAiWidth() {
  try {
    const saved = parseInt(localStorage.getItem(AI_WIDTH_KEY), 10);
    if (Number.isFinite(saved)) return clampAiWidth(saved);
  } catch (_) {}
  return AI_WIDTH_DEFAULT;
}

export function applyAiWidth(px, persist = false) {
  const width = clampAiWidth(px);
  document.documentElement.style.setProperty('--ai-width', width + 'px');

  const rs = v('rightSidebar');
  if (rs) rs.classList.toggle('is-wide', width >= 520);

  const btn = v('aiWideBtn');
  if (btn) {
    const wide = width >= 520;
    btn.title = wide ? 'Restore normal width' : 'Expand for mock interviews';
    btn.setAttribute('aria-label', btn.title);
  }

  if (persist) {
    try { localStorage.setItem(AI_WIDTH_KEY, String(width)); } catch (_) {}
  }
  return width;
}

/** Snap between the normal column and a wide, interview-friendly panel. */

export function toggleAIWide() {
  const current = parseInt(getComputedStyle(document.documentElement)
    .getPropertyValue('--ai-width'), 10) || AI_WIDTH_DEFAULT;
  const wideTarget = clampAiWidth(Math.round(window.innerWidth * 0.5));
  applyAiWidth(current >= 520 ? AI_WIDTH_DEFAULT : wideTarget, true);
}

export function initAiResize() {
  const handle = v('aiResizeHandle');
  const rs = v('rightSidebar');
  if (!handle || !rs) return;

  applyAiWidth(loadAiWidth());

  let startX = 0;
  let startWidth = 0;

  const onMove = (e) => {
    // The panel is on the right, so dragging left (negative dx) widens it.
    applyAiWidth(startWidth + (startX - e.clientX));
  };

  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    rs.classList.remove('resizing');
    document.body.classList.remove('ai-resizing');
    // Persist only once the drag settles, not on every frame.
    applyAiWidth(parseInt(getComputedStyle(document.documentElement)
      .getPropertyValue('--ai-width'), 10) || AI_WIDTH_DEFAULT, true);
  };

  handle.addEventListener('pointerdown', (e) => {
    if (rs.classList.contains('collapsed')) return;
    e.preventDefault();
    startX = e.clientX;
    startWidth = rs.getBoundingClientRect().width;
    rs.classList.add('resizing');
    document.body.classList.add('ai-resizing');
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });

  handle.addEventListener('dblclick', (e) => { e.preventDefault(); toggleAIWide(); });

  // Keyboard: the handle is a real button, so it is tab-reachable.
  handle.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 80 : 24;
    const current = rs.getBoundingClientRect().width;
    if (e.key === 'ArrowLeft')       { e.preventDefault(); applyAiWidth(current + step, true); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); applyAiWidth(current - step, true); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleAIWide(); }
  });

  // A saved width can exceed the viewport after a resize or a move to a
  // smaller screen; re-clamp rather than leaving the panel off-screen.
  window.addEventListener('resize', () => {
    applyAiWidth(rs.getBoundingClientRect().width);
  });
}

// ── Native Gemini Chat Logic ───────────────────────────────────────────
