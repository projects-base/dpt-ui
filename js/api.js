/**
 * api.js — the session and the one way to call the backend.
 *
 * Loaded after config.js (which provides API_BASE) and before dashboard.js and
 * tracker.js. These used to live at the top of dashboard.js, which meant
 * tracker.js silently depended on dashboard.js being loaded first — true, but
 * only by accident of script order in dashboard.html.
 *
 * Classic script, not a module: there is no build step here on purpose, so
 * everything below is a deliberate global.
 */

/* ── logging ─────────────────────────────────────────────────── */

function log(msg, isError = false) {
  if (isError) {
    console.error(`[DPT] ${msg}`);
  } else {
    console.log(`[DPT] ${msg}`);
  }
}

/* ── session ─────────────────────────────────────────────────── */

const REAUTH_FLAG = 'dpt_reauth_attempted';

function getToken() {
  const token = sessionStorage.getItem('gToken');
  if (!token) {
    window.location.href = '/index.html';
    return null;
  }
  return token;
}

function getCachedUser() {
  const raw = sessionStorage.getItem('user');
  try {
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    // A corrupt cache should not take the dashboard down with it.
    sessionStorage.removeItem('user');
    return null;
  }
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getToken()}`,
  };
}

/**
 * Google ID tokens expire after about an hour, after which every API call
 * returns 401 and the dashboard used to sit there showing stale cached data
 * with no way back. Send the user to sign in again instead.
 *
 * Guarded against a redirect loop: if signing in again still produces a 401
 * (a genuine backend/audience misconfiguration rather than an expired token)
 * we stop bouncing and surface the error.
 *
 * @returns {boolean} true if it is redirecting, false if it gave up and showed
 *   the banner — callers use this to decide whether to fall back to cached data.
 */
function handleAuthExpiry() {
  if (sessionStorage.getItem(REAUTH_FLAG)) {
    log('Still unauthorized after re-authenticating — not redirecting again.', true);
    showSessionBanner(
      'The server rejected your sign-in. This usually means the backend GOOGLE_CLIENT_ID ' +
      'does not match this site. Your cached data is shown below.'
    );
    return false;
  }
  sessionStorage.setItem(REAUTH_FLAG, '1');
  sessionStorage.removeItem('gToken');
  sessionStorage.removeItem('user');
  window.location.href = '/index.html?expired=1';
  return true;
}

/** Non-blocking banner pinned to the top of the dashboard. */
function showSessionBanner(message) {
  let bar = document.getElementById('sessionBanner');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'sessionBanner';
    bar.className = 'session-banner';
    document.body.prepend(bar);
  }
  bar.textContent = message;
  bar.style.display = 'block';
}

function signOut() {
  sessionStorage.removeItem('gToken');
  sessionStorage.removeItem('user');
  sessionStorage.removeItem(REAUTH_FLAG);
  // Forget the remembered Google account, so the next sign-in shows the full
  // account chooser instead of jumping straight back into the same one.
  try { google?.accounts?.id?.disableAutoSelect(); } catch (_) {}
  window.location.href = '/index.html';
}

/* ── calling the backend ─────────────────────────────────────── */

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
  get isUnauthorized() { return this.status === 401; }
}

/**
 * One call to the backend.
 *
 * Every call site used to repeat the same four steps by hand — prefix the base
 * URL, attach auth headers, branch on 401, branch on !ok — and they had drifted:
 * some 401s re-authenticated, some logged and returned an empty array, so an
 * expired token behaved differently depending on which panel you were looking
 * at. This makes that one decision, in one place.
 *
 * @param {string} path      Path beginning with '/', or an absolute URL.
 * @param {object} [options]
 * @param {string} [options.method='GET']
 * @param {*}      [options.body]          Serialised as JSON when present.
 * @param {boolean}[options.handle401=true] Re-authenticate on 401. Pass false
 *   when the caller wants to decide (e.g. fall back to cached data instead).
 * @param {boolean}[options.raw=false]     Resolve the Response, not parsed JSON.
 * @returns {Promise<*>} Parsed JSON, or null for an empty body.
 * @throws {ApiError} On any non-2xx response, carrying the status and the
 *   server's own message when it sent one.
 */
async function apiFetch(path, options = {}) {
  const { method = 'GET', body, handle401 = true, raw = false, headers } = options;
  const url = /^https?:\/\//.test(path) ? path : `${API_BASE}${path}`;

  const res = await fetch(url, {
    method,
    headers: { ...authHeaders(), ...(headers || {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (res.status === 401) {
    if (handle401) handleAuthExpiry();
    throw new ApiError(401, 'Your session expired. Please sign in again.');
  }

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const parsed = await res.json();
      if (parsed && parsed.message) message = parsed.message;
    } catch (_) {
      // A non-JSON error body is fine — the status already carries the meaning.
    }
    throw new ApiError(res.status, message);
  }

  if (raw) return res;
  if (res.status === 204) return null;
  return res.json().catch(() => null);
}
