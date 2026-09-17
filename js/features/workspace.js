/**
 * The Drive and Sheets panels.
 *
 * Both are expensive to build and useless until visible, so they wait for
 * TAB_CHANGED rather than ui/tabs knowing they exist. The Drive listing uses
 * its own OAuth access token, not the app's session.
 */
import { escapeHtml, v } from '../core/dom.js';
import { loadSettings, settings } from './settings.js';
import { initAiResize } from '../ui/layout.js';
import { GOOGLE_CLIENT_ID } from '../core/config.js';
import { EVENTS, on } from '../core/events.js';
import { emptyState, errorState, loadingState } from '../ui/states.js';

export let driveAccessToken = null;

export function connectGoogleDrive() {
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

export async function loadFolderDocs() {
  const container = v('folderList');
  if (!driveAccessToken) {
    v('folderAuthBanner').style.display = 'block';
    container.innerHTML = '';
    return;
  }
  if (!settings.folderId) {
    container.innerHTML = emptyState({
      icon: '📁',
      title: 'No Drive folder configured',
      hint: 'Add a Folder ID in Settings and your problem write-ups will appear here.',
    });
    return;
  }
  container.innerHTML = loadingState('Fetching your documents from Drive…');
  try {
    const query = encodeURIComponent(`'${settings.folderId}' in parents and trashed=false`);
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=createdTime+desc&pageSize=15&fields=files(id,name,createdTime,webViewLink)`,
      { headers: { Authorization: `Bearer ${driveAccessToken}` } }
    );
    if (!res.ok) throw new Error('Drive API error: ' + res.status);
    const data = await res.json();
    if (!data.files?.length) {
      container.innerHTML = emptyState({
        icon: '📄',
        title: 'No documents yet',
        hint: 'Submit a problem and one is created for you automatically.',
      });
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
    container.innerHTML = errorState({
      title: 'Could not reach Drive',
      detail: err.message,
      retryAction: 'drive:loadDocs',
    });
  }
}

export function openDriveFolder() {
  if (settings.folderId) {
    window.open(`https://drive.google.com/drive/folders/${settings.folderId}`, '_blank');
  } else {
    alert('No Drive folder configured. Add a Folder ID in Settings first.');
  }
}

// ── Google Sheet Embed ─────────────────────────────────────────────────

export function renderSheetEmbed(force = false) {
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
        <button class="btn btn-primary btn-sm" data-action="tab:switch" data-tab="settings">Add a Sheet URL</button>
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
          <button class="btn btn-ghost btn-sm" data-action="sheet:reload">↻ Try Again</button>
        </div>
      </div>`;
  }, 10000);
}

export function reloadSheetEmbed() { renderSheetEmbed(true); }

export function openSheetExternal() {
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


// Both panels are expensive to build and pointless until visible, so they wait
// to be told a tab opened rather than ui/tabs knowing they exist.
on(EVENTS.TAB_CHANGED, (tabId) => {
  if (tabId === 'folder') loadFolderDocs();
  if (tabId === 'sheet') renderSheetEmbed();
});
