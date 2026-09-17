/**
 * Element lookup and value formatting.
 *
 * The bottom of the stack: it knows the DOM and nothing about problems,
 * categories or the assistant, so every other module may depend on it and it
 * depends on none of them.
 */
export function el(id) { return document.getElementById(id); }

export function getDifficultyClass(diff) {
  switch ((diff || '').toUpperCase()) {
    case 'EASY':   return 'diff-easy';
    case 'MEDIUM': return 'diff-medium';
    case 'HARD':   return 'diff-hard';
    default:       return 'diff-easy';
  }
}

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Add Problem Modal ─────────────────────────────────────────────

export function v(id) { return document.getElementById(id); }

// ── Gemini AI Auto-Fill ────────────────────────────────────────────────
