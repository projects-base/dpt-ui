/**
 * The Gemini panel: the chat transcript, and auto-filling the tracker form
 * from a pasted solution.
 *
 * Renders replies and reports failures inline — an expired session shows in
 * the transcript rather than bouncing the user out mid-conversation.
 */
import { el, escapeHtml, v } from '../core/dom.js';
import { apiFetch } from '../core/http.js';

export async function sendGeminiChat() {
  const inputEl = v('geminiChatInput');
  const text = inputEl.value.trim();
  if (!text) return;

  // Add User msg
  appendGeminiMsg(text, 'user');
  inputEl.value = '';

  // Add loading
  const loadingId = appendGeminiMsg('Thinking...', 'bot', true);

  try {
    // apiFetch surfaces the server's own {"message": "..."} for both a missing
    // key (400) and an upstream refusal (502).
    const data = await apiFetch('/api/gemini/chat', {
      method: 'POST', body: { message: text }, handle401: false,
    });
    updateGeminiMsg(loadingId, formatGeminiMsg(data && data.reply));
  } catch (err) {
    updateGeminiMsg(loadingId, '⚠️ ' + escapeHtml(err.message));
  }
}

export function appendGeminiMsg(text, sender, isLoading = false) {
  const history = v('geminiChatHistory');
  const msg = document.createElement('div');
  msg.className = `gemini-msg ${sender}`;
  // textContent, not innerHTML — user input and raw model output are never
  // markup. Formatted replies go through updateGeminiMsg/formatGeminiMsg,
  // which escapes before adding its own tags.
  msg.textContent = text;
  const id = 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  if (isLoading) msg.id = id;
  history.appendChild(msg);
  history.scrollTop = history.scrollHeight;
  return id;
}

export function updateGeminiMsg(id, html) {
  const el = v(id);
  if (el) {
    el.innerHTML = html;
    v('geminiChatHistory').scrollTop = v('geminiChatHistory').scrollHeight;
  }
}

export function formatGeminiMsg(text) {
  // Escape first, then add our own markup. Without this a reply containing
  // e.g. an <img onerror> ran in the page.
  return escapeHtml(String(text ?? ''))
    // code blocks first (multi-line)
    .replace(/```[\w]*\n?([\s\S]*?)```/g, '<pre style="background:rgba(0,0,0,0.3);padding:8px;border-radius:4px;overflow-x:auto;font-size:12px;margin:6px 0;"><code>$1</code></pre>')
    // inline code
    .replace(/`([^`]+)`/g, '<code style="background:rgba(0,0,0,0.3);padding:2px 5px;border-radius:3px;font-size:12px;">$1</code>')
    // bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // numbered lists
    .replace(/^(\d+\.\s)/gm, '<br>$1')
    // bullet lists
    .replace(/^[-•]\s/gm, '<br>• ')
    // newlines (after block replacements)
    .replace(/\n/g, '<br>');
}

// ── Helper ─────────────────────────────────────────────────────────────

export async function runGeminiAutoFill() {
  const title = v('ext-questionTitle').value.trim();
  const code  = v('ext-code').value.trim();
  if (!title || !code) {
    showGeminiStatus('⚠️ Fill in Question Title and Code before using AI.', 'error');
    return;
  }

  const btn = v('geminiAutoFillBtn');
  btn.disabled = true;
  btn.textContent = '✨ Analyzing...';
  showGeminiStatus('🤖 Calling Gemini AI...', 'loading');

  try {
    const link = v('ext-link').value.trim();
    const result = await analyzeCodeWithGemini(title, code, link);

    // Populate ratings
    ['intuition', 'implementation', 'readability', 'cleanCode'].forEach(id => {
      if (result[id] !== undefined) {
        const el = v(`ext-${id}`);
        if (el) { el.value = result[id]; el.classList.add('gemini-populated'); }
      }
    });

    // Apply difficulty
    if (result.difficulty) {
      const diff = v('ext-difficulty');
      const opt = [...diff.options].find(o => o.value.toLowerCase() === result.difficulty.toLowerCase());
      if (opt) diff.value = opt.value;
    }

    // Append analysis to analysis field
    if (result.analysis) v('ext-analysis').value = result.analysis;

    // Append AI suggestions to code
    if (result.suggestions) {
      const codeEl = v('ext-code');
      const existing = codeEl.value.trimEnd();
      if (!existing.includes('// --- AI Suggestions ---')) {
        let block = '\n\n// --- AI Suggestions ---\n';
        const lines = Array.isArray(result.suggestions)
          ? result.suggestions
          : String(result.suggestions).split('\n');
        block += lines.map(l => '// ' + l.trim()).join('\n');
        codeEl.value = existing + block;
        codeEl.classList.add('gemini-populated');
      }
    }

    showGeminiStatus('🪄 AI auto-fill complete!', 'success');
    setTimeout(() => hideGeminiStatus(), 3000);
  } catch (err) {
    showGeminiStatus('❌ ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" /></svg> AI Auto-Fill`;
  }
}

/**
 * Gemini API call — mirrors extension's gemini.js
 */

export async function analyzeCodeWithGemini(title, code, url = '') {
  const endpoint = `${API_BASE}/api/gemini/analyze`;

  const payload = {
    title: title,
    code: code,
    url: url
  };

  return apiFetch(endpoint, { method: 'POST', body: payload, handle401: false });
}

export function showGeminiStatus(msg, type) {
  const el = v('gemini-status');
  el.textContent = msg;
  el.className = `gemini-status gemini-status--${type}`;
  el.style.display = 'block';
}

export function hideGeminiStatus() {
  const el = v('gemini-status');
  if (el) el.style.display = 'none';
}

// ── Submit Tracker Problem → Dashboard ────────────────────────────────
