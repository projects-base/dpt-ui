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
  settings.openDoc      = v('set-openDoc').checked;
  settings.openSheet    = v('set-openSheet').checked;

  let folderRaw = v('set-folderId').value.trim();
  if (folderRaw.includes('/folders/')) {
    folderRaw = folderRaw.split('/folders/')[1].split('?')[0];
  }
  settings.folderId = folderRaw;

  try {
    const res = await fetch(`${API_BASE}/api/users/me/settings`, {
      method:  'PUT',
      headers: authHeaders(),
      body:    JSON.stringify(settings),
    });
    if (!res.ok) throw new Error('Failed to save settings to server');
    
    // Update local cache
    const user = getCachedUser();
    if (user) {
      Object.assign(user, settings);
      sessionStorage.setItem('user', JSON.stringify(user));
    }
  } catch (e) {
    console.error(e);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); // fallback
  }

  showSettingsStatus('✅ Settings saved!', 'success');
  setTimeout(() => hideSettingsStatus(), 2500);
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
    
    if (!res.ok) throw new Error('API Error: ' + (await res.text()));
    const data = await res.json();
    const reply = data.reply;
    
    updateGeminiMsg(loadingId, formatGeminiMsg(reply));
  } catch (err) {
    updateGeminiMsg(loadingId, '❌ API Error: ' + err.message);
  }
}

function appendGeminiMsg(text, sender, isLoading = false) {
  const history = v('geminiChatHistory');
  const msg = document.createElement('div');
  msg.className = `gemini-msg ${sender}`;
  msg.innerHTML = text; // allow bold/formatting
  const id = 'msg-' + Date.now();
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
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')
    .replace(/```(.*?)```/gs, '<pre style="background:rgba(0,0,0,0.3);padding:8px;border-radius:4px;overflow-x:auto;">$1</pre>');
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

  if (!res.ok) throw new Error('Gemini API Error: ' + (await res.text()));
  const result = await res.json();
  return result;
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

// ── Submit Tracker Problem → Supabase ─────────────────────────────────
async function submitTrackerProblem() {
  const btn   = v('trackerSubmitBtn');
  const title = v('ext-questionTitle').value.trim();

  if (!title) {
    showGeminiStatus('⚠️ Question Title is required.', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Saving...';
  showGeminiStatus('⏳ Saving to Supabase...', 'loading');

  try {
    const cachedUser = getCachedUser();
    if (!cachedUser) { showGeminiStatus('❌ Not signed in.', 'error'); return; }

    // Build notes from ratings
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
    if (code)        notes += `\nCode:\n${code}`;

    const difficulty = v('ext-difficulty').value.toUpperCase();

    const payload = {
      title,
      url:        v('ext-link').value.trim() || null,
      difficulty,
      notes:      notes || null,
      tags:       difficulty,
      user:       { id: cachedUser.id },
    };

    const res = await fetch(`${API_BASE}/api/problems`, {
      method:  'POST',
      headers: authHeaders(),
      body:    JSON.stringify(payload),
    });

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

    // Reload overview
    setTimeout(async () => {
      await refreshProblems();
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

// Expose so dashboard.js can call it after init
async function refreshProblems() {
  const user = getCachedUser();
  if (!user) return;
  const problems = await loadProblems(user.id);
  renderProblems(problems);
}

// ── Google Drive Folder Browser ────────────────────────────────────────
let driveAccessToken = null;

function connectGoogleDrive() {
  // Use Google Identity Services token client for OAuth (access token for Drive)
  if (!window.google?.accounts?.oauth2) {
    alert('Google Identity Services not loaded.');
    return;
  }
  const client = google.accounts.oauth2.initTokenClient({
    client_id: '683627191123-5551q39di0quqsd7p3oj1nt6oodlajfe.apps.googleusercontent.com',
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
      const name = f.name.replace(/</g,'&lt;').replace(/>/g,'&gt;');
      return `<a href="${f.webViewLink}" target="_blank" class="qv-doc-item">
        <span class="qv-doc-icon">📄</span>
        <div class="qv-doc-info">
          <span class="qv-doc-name">${name}</span>
          <span class="qv-doc-date">${date}</span>
        </div>
        <span class="qv-doc-arrow">↗</span>
      </a>`;
    }).join('');
  } catch (err) {
    container.innerHTML = `<p class="qv-placeholder" style="color:#ef4444;">Failed to load: ${err.message}</p>`;
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
    container.innerHTML = `<p class="qv-placeholder">Add a Google Sheet URL in <button class="link-btn" onclick="switchTab('settings')">Settings</button> to embed it here.</p>`;
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
  
  // Collapse right sidebar by default on load
  const rs = v('rightSidebar');
  if (rs && !rs.classList.contains('collapsed')) {
    rs.classList.add('collapsed');
  }
});
