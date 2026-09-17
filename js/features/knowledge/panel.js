/**
 * The side panel that opens when a map node is selected, including the
 * picture-in-picture pop-out.
 *
 * Its own module because embedding is fiddly and self-contained: several hosts
 * refuse to be framed, so it decides between an iframe and a new window.
 */
import { escapeHtml, v } from '../../core/dom.js';

export const NO_EMBED_HOSTS = [
  'algomaster.io',
  'takeuforward.org',
  'instagram.com',
  'leetcode.com',
  'github.com',
  'stackoverflow.com',
  'medium.com',
  'linkedin.com',
  'x.com',
  'twitter.com',
  'facebook.com',
  'reddit.com',
  'geeksforgeeks.org',
  'hackerrank.com',
  'codeforces.com',
];

/** True when the host (or a parent domain of it) is known to block framing. */

export function blocksEmbedding(hostname) {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  return NO_EMBED_HOSTS.some(blocked => host === blocked || host.endsWith('.' + blocked));
}

/* Convert a regular YouTube watch URL to an embed URL.
   Returns null when the target cannot be framed at all. */

export function toEmbedUrl(url) {
  const origin = encodeURIComponent(window.location.origin || 'https://localhost');
  try {
    const u = new URL(url);
    // youtube.com/watch?v=ID
    if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) {
      const id = u.searchParams.get('v');
      return `https://www.youtube.com/embed/${id}?autoplay=0&rel=0&origin=${origin}&enablejsapi=1`;
    }
    // youtu.be/ID
    if (u.hostname === 'youtu.be') {
      const id = u.pathname.slice(1).split('?')[0];
      return `https://www.youtube.com/embed/${id}?autoplay=0&rel=0&origin=${origin}&enablejsapi=1`;
    }
    if (blocksEmbedding(u.hostname)) return null;
  } catch(_) {}
  return url; // articles / other URLs — try directly
}

export function openKwPanel(nodeData) {
  const panel   = document.getElementById('kwIframePanel');
  const iframe  = document.getElementById('kwpIframe');
  const loader  = document.getElementById('kwpLoader');
  const blocked = document.getElementById('kwpBlocked');
  const extLink = document.getElementById('kwpExternalLink');
  const blockedLink = document.getElementById('kwpBlockedLink');

  // Update header
  const rawLabel = (nodeData.label || '').replace(/^\S+\s/, '');
  document.getElementById('kwpTitle').textContent = rawLabel;
  document.getElementById('kwpIcon').textContent  = (nodeData.label || '🔗').split(' ')[0];
  extLink.href      = nodeData.url;
  blockedLink.href  = nodeData.url;

  const embedUrl = toEmbedUrl(nodeData.url);

  // Reset state
  iframe.classList.remove('loaded');
  iframe.src  = '';
  loader.style.display  = 'flex';
  blocked.style.display = 'none';
  panel.classList.add('open');

  if (!embedUrl) {
    // Known to block framing — say so rather than letting the browser show a
    // bare "refused to connect".
    loader.style.display  = 'none';
    blocked.style.display = 'flex';
    const note = document.getElementById('kwpBlockedNote');
    if (note) {
      let host = nodeData.url;
      try { host = new URL(nodeData.url).hostname.replace(/^www\./, ''); } catch (_) {}
      note.textContent = `${host} does not allow being embedded in other sites, so it opens in a new tab.`;
    }
    return;
  }

  // For hosts we have not classified, a blocked frame simply never fires
  // `load`. Four seconds is long enough for a slow page and short enough that
  // a blocked one does not sit on Chrome's error for ages.
  let blockTimer = setTimeout(() => {
    if (!iframe.classList.contains('loaded')) {
      loader.style.display  = 'none';
      blocked.style.display = 'flex';
    }
  }, 4000);

  iframe.onload = () => {
    clearTimeout(blockTimer);
    loader.style.display = 'none';
    iframe.classList.add('loaded');
  };
  iframe.setAttribute('data-raw-url', nodeData.url); // save original for PiP
  iframe.src = embedUrl;
}

export function closeKwPanel() {
  const panel  = document.getElementById('kwIframePanel');
  const iframe = document.getElementById('kwpIframe');
  panel.classList.remove('open');
  // stop any playing video / loading after transition
  setTimeout(() => { iframe.src = ''; }, 320);
}

// ── Picture-in-Picture ────────────────────────────────────────────────

export async function toggleKwPiP() {
  const iframe = document.getElementById('kwpIframe');
  if (!iframe || !iframe.src) {
    alert('No resource is loaded. Click a node with a link first.');
    return;
  }

  // Re-resolve embed URL fresh (picks up origin correctly)
  const rawSrc = iframe.getAttribute('data-raw-url') || iframe.src;
  const src    = toEmbedUrl(rawSrc) || rawSrc;
  const title  = document.getElementById('kwpTitle').textContent;

  // ── Try Document Picture-in-Picture API (Chrome 116+) ──
  if ('documentPictureInPicture' in window) {
    try {
      const pipWin = await documentPictureInPicture.requestWindow({
        width: 560, height: 315,
        disallowReturnToOpener: false,
      });

      const style = pipWin.document.createElement('style');
      style.textContent = `
        * { margin:0; padding:0; box-sizing:border-box; }
        body { background:#000; overflow:hidden; font-family:system-ui,sans-serif; }
        .pip-shell { display:flex; flex-direction:column; height:100vh; }
        .pip-bar {
          display:flex; align-items:center;
          padding:6px 10px; background:rgba(10,12,22,0.95);
          border-bottom:1px solid rgba(255,255,255,0.07);
        }
        .pip-bar span { color:#e2e8f0; font-size:12px; white-space:nowrap;
          overflow:hidden; text-overflow:ellipsis; max-width:220px; }
        iframe { flex:1; width:100%; border:none; }
      `;
      pipWin.document.head.appendChild(style);

      pipWin.document.body.innerHTML = `
        <div class="pip-shell">
          <div class="pip-bar">
            <span>\uD83C\uDFA5 ${escapeHtml(title)}</span>
          </div>
          <iframe src="${src}" frameborder="0" referrerpolicy="origin"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen></iframe>
        </div>`;

      closeKwPanel();
      return;
    } catch (err) {
      console.warn('Document PiP failed, falling back to popup:', err);
    }
  }

  // ── Fallback: small positioned popup ──
  _openKwPopup(src, title);
  closeKwPanel();
}

export function _openKwPopup(src, title) {
  const safeTitle = escapeHtml(title);
  const pw = 560, ph = 340;
  const left = Math.max(0, screen.width  - pw - 20);
  const top  = Math.max(0, screen.height - ph - 60);
  const popup = window.open('', 'kwPiP',
    `width=${pw},height=${ph},left=${left},top=${top},` +
    `toolbar=0,menubar=0,location=0,status=0,resizable=1`);
  if (!popup) { alert('Pop-up blocked. Please allow pop-ups for this site.'); return; }
  popup.document.write(`<!DOCTYPE html>
<html><head><title>${safeTitle}</title><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#000;display:flex;flex-direction:column;height:100vh;font-family:system-ui,sans-serif}
  .bar{padding:6px 10px;background:rgba(10,12,22,0.95);border-bottom:1px solid rgba(255,255,255,0.07);
       display:flex;align-items:center;gap:6px;color:#e2e8f0;font-size:12px;}
  iframe{flex:1;width:100%;border:none}
</style></head>
<body>
  <div class="bar">\uD83C\uDFA5 ${safeTitle}</div>
  <iframe src="${src}" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture"
    allowfullscreen></iframe>
</body></html>`);
  popup.document.close();
}
