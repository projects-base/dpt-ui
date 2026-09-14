/**
 * tracker.js — Extension features ported to the Web Dashboard
 *
 * Features:
 * - Tab switching (Overview / Add Problem / Drive / Sheet / Settings)
 * - Add Problem form with Gemini AI auto-fill
 * - Google Drive folder browser (via Google OAuth popup)
 * - Google Sheet embed
 * - Settings (persisted in localStorage)
 */

// ── Settings (persisted in localStorage) ──────────────────────────────
const SETTINGS_KEY = 'dpt_settings';
let settings = {
  sheetUrl:   '',
  folderId:   '',
  googleApiKey: '',
  geminiModel: '',
  geminiKey:  '',
  aiChatUrl:  '',
  openDoc:    false,
  openSheet:  false,
};

function loadSettings() {
  const user = getCachedUser();
  if (user) {
    settings.sheetUrl = user.sheetUrl || '';
    settings.folderId = user.folderId || '';
    settings.googleApiKey = user.googleApiKey || '';
    settings.geminiModel  = user.geminiModel  || '';
    settings.openDoc = !!user.openDoc;
    settings.openSheet = !!user.openSheet;
  } else {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) settings = { ...settings, ...JSON.parse(raw) };
    } catch (_) {}
  }
  // Populate settings form
  const s = settings;
  v('set-sheetUrl').value     = s.sheetUrl  || '';
  v('set-folderId').value     = s.folderId  || '';
  v('set-googleApiKey').value = s.googleApiKey || '';
  setModelOptions(s.geminiModel ? [{ name: s.geminiModel, displayName: s.geminiModel }] : [],
                  s.geminiModel || '');
  const geminiKeyEl = v('set-geminiKey');
  if (geminiKeyEl) geminiKeyEl.value = s.geminiKey || '';
  const aiChatUrlEl = v('set-aiChatUrl');
  if (aiChatUrlEl) aiChatUrlEl.value = s.aiChatUrl || '';
  v('set-openDoc').checked    = !!s.openDoc;
  v('set-openSheet').checked  = !!s.openSheet;
}

async function saveSettings() {
  settings.sheetUrl     = v('set-sheetUrl').value.trim();
  settings.googleApiKey = v('set-googleApiKey').value.trim();
  settings.geminiModel  = v('set-geminiModel') ? v('set-geminiModel').value : '';
  settings.openDoc      = v('set-openDoc').checked;
  settings.openSheet    = v('set-openSheet').checked;

  let folderRaw = v('set-folderId').value.trim();
  if (folderRaw.includes('/folders/')) {
    folderRaw = folderRaw.split('/folders/')[1].split('?')[0];
  }
  settings.folderId = folderRaw;

  // Only the fields the server knows about. geminiKey and aiChatUrl are
  // browser-local extras and were being silently dropped by the API.
  const serverSettings = {
    sheetUrl:     settings.sheetUrl,
    folderId:     settings.folderId,
    googleApiKey: settings.googleApiKey,
    geminiModel:  settings.geminiModel,
    openDoc:      settings.openDoc,
    openSheet:    settings.openSheet,
  };

  // Keep the browser-local extras regardless of what the server does.
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));

  try {
    const res = await fetch(`${API_BASE}/api/users/me/settings`, {
      method:  'PUT',
      headers: authHeaders(),
      body:    JSON.stringify(serverSettings),
    });

    if (res.status === 401) {
      showSettingsStatus('Your session expired. Please sign in again.', 'error');
      return;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${res.status}`);
    }

    // Update local cache
    const user = getCachedUser();
    if (user) {
      Object.assign(user, serverSettings);
      sessionStorage.setItem('user', JSON.stringify(user));
    }

    showSettingsStatus('✅ Settings saved!', 'success');
    setTimeout(() => hideSettingsStatus(), 2500);
  } catch (e) {
    // Saying "saved" after a failed request meant settings silently reverted
    // on the next device. Report it instead.
    console.error('[Settings] Save failed:', e);
    showSettingsStatus(
      `⚠️ Saved on this device only — the server rejected it (${e.message}).`,
      'error'
    );
  }
}

function showSettingsStatus(msg, type = 'success') {
  const el = v('settings-status');
  el.textContent = msg;
  el.style.display = 'block';
  el.className = `settings-status settings-status--${type}`;
}
function hideSettingsStatus() {
  const el = v('settings-status');
  if (el) el.style.display = 'none';
}


// ── Gemini model picker ────────────────────────────────────────────
//
// Which models a key can call varies by key, project and region, and Gemini
// reports an unavailable name as a bare 404. So the list is fetched from the
// API rather than hard-coded, and the choice is stored per user.

/** Rebuilds the select, keeping `selected` chosen even if it is not in `models`. */
function setModelOptions(models, selected) {
  const sel = v('set-geminiModel');
  if (!sel) return;

  sel.innerHTML = '';
  const def = document.createElement('option');
  def.value = '';
  def.textContent = 'Server default';
  sel.appendChild(def);

  const names = new Set();
  (models || []).forEach(m => {
    if (names.has(m.name)) return;
    names.add(m.name);
    const opt = document.createElement('option');
    opt.value = m.name;
    opt.textContent = m.displayName && m.displayName !== m.name
      ? `${m.name} — ${m.displayName}`
      : m.name;
    sel.appendChild(opt);
  });

  // A previously saved model stays selectable before the list is loaded.
  if (selected && !names.has(selected)) {
    const opt = document.createElement('option');
    opt.value = selected;
    opt.textContent = selected + ' (saved)';
    sel.appendChild(opt);
  }

  sel.value = selected || '';
}

function showModelHint(msg, kind) {
  const el = v('modelHint');
  if (!el) return;
  el.textContent = msg;
  el.className = 'form-hint' + (kind ? ' ' + kind : '');
}

/** Asks the backend which models this user's key can actually call. */
async function loadGeminiModels() {
  const btn = v('loadModelsBtn');
  const original = btn ? btn.textContent : null;
  if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
  showModelHint('Asking Gemini which models your key can use…');

  try {
    const res = await fetch(`${API_BASE}/api/gemini/models`, { headers: authHeaders() });

    if (res.status === 401) {
      showModelHint('Your session expired. Please sign in again.', 'fail');
      return;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Could not load models (HTTP ${res.status})`);
    }

    const data = await res.json();
    const models = data.models || [];
    if (!models.length) {
      showModelHint('Your key returned no models that support content generation.', 'fail');
      return;
    }

    setModelOptions(models, settings.geminiModel || '');
    showModelHint(`${models.length} model${models.length === 1 ? '' : 's'} available. ` +
                  'Pick one and press Save Configuration.', 'ok');
  } catch (err) {
    showModelHint(err.message, 'fail');
  } finally {
    if (btn) { btn.disabled = false; if (original !== null) btn.textContent = original; }
  }
}

// ── Tab Switching ──────────────────────────────────────────────────────
function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.dash-tab').forEach(btn => btn.classList.remove('active'));

  const panel = document.getElementById(`tab-${tabId}`);
  const btn   = document.querySelector(`.dash-tab[data-tab="${tabId}"]`);
  if (panel) panel.classList.add('active');
  if (btn)   btn.classList.add('active');

  if (tabId === 'folder') loadFolderDocs();
  if (tabId === 'sheet')  renderSheetEmbed();
}

document.querySelectorAll('.dash-tab').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// ── Layout Toggles ─────────────────────────────────────────────────────
function toggleLeftSidebar() {
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) sidebar.classList.toggle('collapsed');
}

function toggleAIChat() {
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

const AI_WIDTH_KEY = 'dpt_ai_panel_width';
const AI_WIDTH_MIN = 300;
const AI_WIDTH_DEFAULT = 340;

/** Upper bound: never let the panel crowd out the main content entirely. */
function aiWidthMax() {
  return Math.max(AI_WIDTH_MIN, Math.min(920, Math.round(window.innerWidth * 0.75)));
}

function clampAiWidth(px) {
  return Math.min(aiWidthMax(), Math.max(AI_WIDTH_MIN, Math.round(px)));
}

function loadAiWidth() {
  try {
    const saved = parseInt(localStorage.getItem(AI_WIDTH_KEY), 10);
    if (Number.isFinite(saved)) return clampAiWidth(saved);
  } catch (_) {}
  return AI_WIDTH_DEFAULT;
}

function applyAiWidth(px, persist = false) {
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
function toggleAIWide() {
  const current = parseInt(getComputedStyle(document.documentElement)
    .getPropertyValue('--ai-width'), 10) || AI_WIDTH_DEFAULT;
  const wideTarget = clampAiWidth(Math.round(window.innerWidth * 0.5));
  applyAiWidth(current >= 520 ? AI_WIDTH_DEFAULT : wideTarget, true);
}

function initAiResize() {
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
async function sendGeminiChat() {
  const inputEl = v('geminiChatInput');
  const text = inputEl.value.trim();
  if (!text) return;

  // Add User msg
  appendGeminiMsg(text, 'user');
  inputEl.value = '';

  // Add loading
  const loadingId = appendGeminiMsg('Thinking...', 'bot', true);

  try {
    const endpoint = `${API_BASE}/api/gemini/chat`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ message: text })
    });

    if (res.status === 401) {
      updateGeminiMsg(loadingId, 'Your session expired. Please sign in again.');
      return;
    }
    if (!res.ok) {
      // The server sends {"message": "..."} for both a missing key (400) and
      // an upstream refusal (502). It previously returned an empty body, which
      // rendered as "API Error:" with nothing after it.
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Gemini request failed (HTTP ${res.status})`);
    }
    const data = await res.json();
    const reply = data.reply;

    updateGeminiMsg(loadingId, formatGeminiMsg(reply));
  } catch (err) {
    updateGeminiMsg(loadingId, '⚠️ ' + escapeHtml(err.message));
  }
}

function appendGeminiMsg(text, sender, isLoading = false) {
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

function updateGeminiMsg(id, html) {
  const el = v(id);
  if (el) {
    el.innerHTML = html;
    v('geminiChatHistory').scrollTop = v('geminiChatHistory').scrollHeight;
  }
}

function formatGeminiMsg(text) {
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
function v(id) { return document.getElementById(id); }

// ── Gemini AI Auto-Fill ────────────────────────────────────────────────
async function runGeminiAutoFill() {
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
async function analyzeCodeWithGemini(title, code, url = '') {
  const endpoint = `${API_BASE}/api/gemini/analyze`;

  const payload = {
    title: title,
    code: code,
    url: url
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Gemini request failed (HTTP ${res.status})`);
  }
  return res.json();
}

function showGeminiStatus(msg, type) {
  const el = v('gemini-status');
  el.textContent = msg;
  el.className = `gemini-status gemini-status--${type}`;
  el.style.display = 'block';
}
function hideGeminiStatus() {
  const el = v('gemini-status');
  if (el) el.style.display = 'none';
}

// ── Submit Tracker Problem → Dashboard ────────────────────────────────
async function submitTrackerProblem() {
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

    const res = await fetch(`${API_BASE}/api/problems`, {
      method:  'POST',
      headers: authHeaders(),
      body:    JSON.stringify(payload),
    });

    if (res.status === 401) {
      showGeminiStatus('❌ Your session expired. Please sign in again.', 'error');
      return;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Server error ${res.status}`);
    }

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
const refreshProblems = refreshOverview;

// ── Google Drive Folder Browser ────────────────────────────────────────
let driveAccessToken = null;

function connectGoogleDrive() {
  // Use Google Identity Services token client for OAuth (access token for Drive)
  if (!window.google?.accounts?.oauth2) {
    alert('Google Identity Services not loaded.');
    return;
  }
  const client = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    callback: (resp) => {
      if (resp.error) { console.error('Drive auth error:', resp); return; }
      driveAccessToken = resp.access_token;
      v('folderAuthBanner').style.display = 'none';
      loadFolderDocs();
    }
  });
  client.requestAccessToken();
}

async function loadFolderDocs() {
  const container = v('folderList');
  if (!driveAccessToken) {
    v('folderAuthBanner').style.display = 'block';
    container.innerHTML = '';
    return;
  }
  if (!settings.folderId) {
    container.innerHTML = '<p class="qv-placeholder">No Drive folder configured.<br>Add a Folder ID in Settings.</p>';
    return;
  }
  container.innerHTML = '<p class="qv-placeholder">⏳ Loading documents…</p>';
  try {
    const query = encodeURIComponent(`'${settings.folderId}' in parents and trashed=false`);
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=createdTime+desc&pageSize=15&fields=files(id,name,createdTime,webViewLink)`,
      { headers: { Authorization: `Bearer ${driveAccessToken}` } }
    );
    if (!res.ok) throw new Error('Drive API error: ' + res.status);
    const data = await res.json();
    if (!data.files?.length) {
      container.innerHTML = '<p class="qv-placeholder">No documents yet. Submit a problem to auto-create one.</p>';
      return;
    }
    container.innerHTML = data.files.map(f => {
      const date = new Date(f.createdTime).toLocaleDateString();
      const name = escapeHtml(f.name);
      return `<a href="${escapeHtml(f.webViewLink)}" target="_blank" rel="noopener noreferrer" class="qv-doc-item">
        <span class="qv-doc-icon">📄</span>
        <div class="qv-doc-info">
          <span class="qv-doc-name">${name}</span>
          <span class="qv-doc-date">${date}</span>
        </div>
        <span class="qv-doc-arrow">↗</span>
      </a>`;
    }).join('');
  } catch (err) {
    container.innerHTML =
      `<p class="qv-placeholder" style="color:#ef4444;">Failed to load: ${escapeHtml(err.message)}</p>`;
  }
}

function openDriveFolder() {
  if (settings.folderId) {
    window.open(`https://drive.google.com/drive/folders/${settings.folderId}`, '_blank');
  } else {
    alert('No Drive folder configured. Add a Folder ID in Settings first.');
  }
}

// ── Google Sheet Embed ─────────────────────────────────────────────────
function renderSheetEmbed(force = false) {
  const container = v('sheetEmbed');
  if (!settings.sheetUrl) {
    // One line of text stranded in a tall empty card reads as broken. Give the
    // empty state a shape, and a way out of it.
    container.innerHTML = `
      <div class="sheet-empty">
        <div class="sheet-empty-icon">${String.fromCodePoint(0x1F4CA)}</div>
        <p class="sheet-empty-title">No spreadsheet connected</p>
        <p class="sheet-empty-msg">
          Point this at the Google Sheet you track problems in and it will be embedded here,
          so you never have to leave the dashboard.
        </p>
        <button class="btn btn-primary btn-sm" onclick="switchTab('settings')">Add a Sheet URL</button>
      </div>`;
    return;
  }
  if (!force && v('sheetIframe')) return; // already loaded

  const sheetId = settings.sheetUrl.includes('/d/')
    ? settings.sheetUrl.split('/d/')[1].split('/')[0]
    : settings.sheetUrl;
  const embedUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit?usp=sharing&rm=minimal`;

  container.innerHTML = `
    <div class="sheet-loader" id="sheetLoader">
      <div class="sheet-spinner"></div>
      <span>Loading spreadsheet…</span>
    </div>
    <iframe id="sheetIframe" class="sheet-iframe hidden" src="${embedUrl}" frameborder="0" allowfullscreen></iframe>`;

  const iframe = v('sheetIframe');
  const loader = v('sheetLoader');
  iframe.addEventListener('load', () => {
    clearTimeout(failTimer);
    if (loader) loader.remove();
    iframe.classList.remove('hidden');
  }, { once: true });

  const failTimer = setTimeout(() => {
    if (!v('sheetLoader')) return;
    container.innerHTML = `
      <div class="sheet-error">
        <div class="sheet-error-icon">📄</div>
        <p class="sheet-error-title">Couldn't embed the Sheet</p>
        <p class="sheet-error-msg">Google Sheets may be blocking preview. Open it directly instead.</p>
        <div class="sheet-error-actions">
          <a href="${settings.sheetUrl}" target="_blank" class="btn btn-primary btn-sm">Open Full Sheet ↗</a>
          <button class="btn btn-ghost btn-sm" onclick="renderSheetEmbed(true)">↻ Try Again</button>
        </div>
      </div>`;
  }, 10000);
}

function reloadSheetEmbed() { renderSheetEmbed(true); }
function openSheetExternal() {
  if (settings.sheetUrl) window.open(settings.sheetUrl, '_blank');
  else alert('No Google Sheet configured. Add one in Settings.');
}

// ── Bootstrap ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  initAiResize();

  // Collapse right sidebar by default on load
  const rs = v('rightSidebar');
  if (rs && !rs.classList.contains('collapsed')) {
    rs.classList.add('collapsed');
  }
});
