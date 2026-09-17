/**
 * The Log Problem form.
 *
 * One job: turn the filled-in form into a saved problem, then hand back to the
 * overview. The analysis that populates it belongs to the assistant.
 */
import { el, v } from '../core/dom.js';
import { hideGeminiStatus, showGeminiStatus } from './assistant.js';
import { refreshOverview } from './overview.js';
import { switchTab } from '../ui/tabs.js';
import { apiFetch } from '../core/http.js';
import { getCachedUser } from '../core/session.js';

export async function submitTrackerProblem() {
  const btn   = v('trackerSubmitBtn');
  const title = v('ext-questionTitle').value.trim();

  if (!title) {
    showGeminiStatus('⚠️ Question Title is required.', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Saving...';
  showGeminiStatus('⏳ Saving…', 'loading');

  try {
    const cachedUser = getCachedUser();
    if (!cachedUser) { showGeminiStatus('❌ Not signed in.', 'error'); return; }

    const question  = v('ext-question').value.trim();

    // Build notes from ratings (keep for backwards compat / display)
    let notes = '';
    const analysis = v('ext-analysis').value.trim();
    const intuition = v('ext-intuition').value;
    const impl      = v('ext-implementation').value;
    const readability = v('ext-readability').value;
    const cleanCode = v('ext-cleanCode').value;
    const code      = v('ext-code').value.trim();

    if (analysis)    notes += `Analysis: ${analysis}\n`;
    if (intuition)   notes += `Intuition: ${intuition}/10\n`;
    if (impl)        notes += `Implementation: ${impl}/10\n`;
    if (readability) notes += `Readability: ${readability}/10\n`;
    if (cleanCode)   notes += `Clean Code: ${cleanCode}/10\n`;

    const difficulty = v('ext-difficulty').value.toUpperCase();

    const payload = {
      title,
      url:        v('ext-link').value.trim() || null,
      difficulty,
      notes:      notes || null,
      question:   question || null,
      code:       code || null,
      tags:       difficulty,
    };

    await apiFetch('/api/problems', { method: 'POST', body: payload, handle401: false });

    showGeminiStatus('✅ Problem saved to dashboard!', 'success');

    // Clear form
    ['ext-questionTitle','ext-question','ext-link','ext-analysis',
     'ext-intuition','ext-implementation','ext-readability','ext-cleanCode','ext-code']
      .forEach(id => { const el = v(id); if (el) el.value = ''; });
    v('ext-difficulty').value = 'Medium';
    document.querySelectorAll('.gemini-populated').forEach(el => el.classList.remove('gemini-populated'));

    // Reload overview — refresh both problems and analytics
    setTimeout(async () => {
      await refreshOverview();
      hideGeminiStatus();
      switchTab('overview');
    }, 1500);

  } catch (err) {
    showGeminiStatus('❌ ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg> Save to Dashboard`;
  }
}

// Kept as an alias: refreshOverview (dashboard.js) also repaints the stat tiles.
