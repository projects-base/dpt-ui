/**
 * User settings: the Drive and Sheets targets, the Gemini key and model.
 *
 * Holds the one mutable `settings` object the workspace panels read. Browser
 * extras stay in localStorage; anything the server owns goes to the server.
 */
import { el, v } from '../core/dom.js';
import { ApiError, apiFetch } from '../core/http.js';
import { getCachedUser } from '../core/session.js';

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

export let settings = {
  sheetUrl:   '',
  folderId:   '',
  googleApiKey: '',
  geminiModel: '',
  geminiKey:  '',
  aiChatUrl:  '',
  openDoc:    false,
  openSheet:  false,
};

export function loadSettings() {
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

export async function saveSettings() {
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
    // handle401: false throughout this file — these panels show the expiry
    // inline rather than bouncing the user out mid-edit.
    await apiFetch('/api/users/me/settings', {
      method: 'PUT', body: serverSettings, handle401: false,
    });

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
    if (e instanceof ApiError && e.isUnauthorized) {
      showSettingsStatus('Your session expired. Please sign in again.', 'error');
      return;
    }
    showSettingsStatus(
      `⚠️ Saved on this device only — the server rejected it (${e.message}).`,
      'error'
    );
  }
}

export function showSettingsStatus(msg, type = 'success') {
  const el = v('settings-status');
  el.textContent = msg;
  el.style.display = 'block';
  el.className = `settings-status settings-status--${type}`;
}

export function hideSettingsStatus() {
  const el = v('settings-status');
  if (el) el.style.display = 'none';
}


// ── Gemini model picker ────────────────────────────────────────────
//
// Which models a key can call varies by key, project and region, and Gemini
// reports an unavailable name as a bare 404. So the list is fetched from the
// API rather than hard-coded, and the choice is stored per user.

/** Rebuilds the select, keeping `selected` chosen even if it is not in `models`. */

export function setModelOptions(models, selected) {
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

export function showModelHint(msg, kind) {
  const el = v('modelHint');
  if (!el) return;
  el.textContent = msg;
  el.className = 'form-hint' + (kind ? ' ' + kind : '');
}

/** Asks the backend which models this user's key can actually call. */

export async function loadGeminiModels() {
  const btn = v('loadModelsBtn');
  const original = btn ? btn.textContent : null;
  if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
  showModelHint('Asking Gemini which models your key can use…');

  try {
    const data = await apiFetch('/api/gemini/models', { handle401: false });
    const models = (data && data.models) || [];
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
