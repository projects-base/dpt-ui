/**
 * Who is signed in, and what to do when that stops being true.
 *
 * One responsibility: the browser-side session. It knows about sessionStorage
 * and the sign-in page; it knows nothing about problems, analytics or the
 * knowledge map.
 */
import { log } from './log.js';
import { DEMO_USER, isDemoMode } from './demo.js';
import { GOOGLE_CLIENT_ID } from './config.js';

export const REAUTH_FLAG = 'dpt_reauth_attempted';

export function getToken() {
  // A demo visitor has no Google token and must not be sent to sign in for one.
  // The value is never sent anywhere — apiFetch returns before it is used.
  if (isDemoMode()) return 'demo';

  const token = sessionStorage.getItem('gToken');
  if (!token) {
    window.location.href = '/index.html';
    return null;
  }
  return token;
}

export function getCachedUser() {
  if (isDemoMode()) return DEMO_USER;

  const raw = sessionStorage.getItem('user');
  try {
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    // A corrupt cache should not take the dashboard down with it.
    sessionStorage.removeItem('user');
    return null;
  }
}

export function authHeaders() {
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
export function handleAuthExpiry() {
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
export function showSessionBanner(message) {
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

export function signOut() {
  // Leaving the demo is just leaving the demo — there is no session to end.
  if (isDemoMode()) {
    window.location.href = '/dashboard.html?demo=0';
    return;
  }
  sessionStorage.removeItem('gToken');
  sessionStorage.removeItem('user');
  sessionStorage.removeItem(REAUTH_FLAG);
  // Forget the remembered Google account, so the next sign-in shows the full
  // account chooser instead of jumping straight back into the same one.
  try { google?.accounts?.id?.disableAutoSelect(); } catch (_) {}
  window.location.href = '/index.html';
}
