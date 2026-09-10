/**
 * auth.js — Google Sign-In flow for Daily Problem Tracker
 *
 * Uses Google Identity Services (GSI) to render the sign-in button.
 * When the user clicks it and selects their Google account, GSI calls
 * handleGoogleCredential() with the raw ID token.
 * We POST it to our backend, which validates it and creates/upserts the user.
 */

// API_BASE is now globally provided by config.js

// ── Helpers ─────────────────────────────────────────────────────

function showError(msg) {
  const banner = document.getElementById('errorBanner');
  const text = document.getElementById('errorText');
  if (!banner || !text) return;
  text.textContent = msg;
  banner.style.display = 'flex';
}

function hideError() {
  const banner = document.getElementById('errorBanner');
  if (banner) banner.style.display = 'none';
}

function showLoading(show) {
  const loading = document.getElementById('loadingState');
  const btnWrap = document.getElementById('google-signin-btn');
  if (loading) loading.style.display = show ? 'flex' : 'none';
  if (btnWrap) btnWrap.style.display = show ? 'none' : 'flex';
}

// ── Main callback — called by Google GSI after user selects account ──

async function handleGoogleCredential(response) {
  hideError();
  showLoading(true);
  console.log('[Auth] Google credential received, attempting backend login...');

  try {
    console.log('[Auth] POSTing to', `${API_BASE}/auth/google`);
    const res = await fetch(`${API_BASE}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: response.credential }),
    });

    let data;
    try {
      data = await res.json();
    } catch (parseErr) {
      throw new Error(`Backend returned non-JSON response (status ${res.status})`);
    }

    console.log('[Auth] Backend response:', res.status, data);

    if (!res.ok) {
      throw new Error(data.message || `Login failed (status ${res.status}). Please try again.`);
    }

    if (!data.id || !data.email) {
      throw new Error(`Unexpected response from server: ${JSON.stringify(data)}`);
    }

    // Persist the token and user profile for subsequent API calls
    sessionStorage.setItem('gToken', response.credential);
    sessionStorage.setItem('user', JSON.stringify(data));

    console.log('[Auth] Login successful, redirecting to dashboard...');
    sessionStorage.removeItem('dpt_reauth_attempted');
    // Navigate to dashboard
    window.location.href = '/dashboard.html';

  } catch (err) {
    showLoading(false);
    const msg = err.message || 'Unable to connect to the server. Is the backend running on port 8080?';
    showError(msg);
    console.error('[Auth] Google login error:', err);
  }
}

// ── Initialize Google Identity Services ─────────────────────────

/** True when the dashboard bounced us here because the token expired. */
function isExpiredReturn() {
  return new URLSearchParams(window.location.search).has('expired');
}

window.addEventListener('load', () => {
  // If already signed in, skip straight to dashboard.
  // Not when returning from an expiry bounce — the dashboard has already
  // cleared the stale token, and re-entering would just loop.
  if (!isExpiredReturn() && sessionStorage.getItem('gToken') && sessionStorage.getItem('user')) {
    window.location.href = '/dashboard.html';
    return;
  }

  if (isExpiredReturn()) {
    showError('Your session expired. Please sign in again to continue.');
  }

  // If the account chooser never appears, the origin this page is served from
  // is almost certainly missing from the OAuth client's "Authorized JavaScript
  // origins". Google matches scheme + host + PORT exactly, and reports it only
  // in the console, so surface it here where it can actually be seen.
  console.info(
    '[Auth] This page origin is %s — it must be listed verbatim under ' +
    'Authorized JavaScript origins for client %s. See OAUTH_VERIFICATION.md.',
    window.location.origin, GOOGLE_CLIENT_ID
  );

  // Render GSI button once the library is ready
  const tryInit = () => {
    if (typeof google === 'undefined' || !google.accounts) {
      setTimeout(tryInit, 100);
      return;
    }

    google.accounts.id.initialize({
      // Defined once in js/config.js, shared with the Drive token client.
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleCredential,
      // Always let the user choose. auto_select silently reuses the last
      // account, which is wrong for anyone with more than one Google login.
      auto_select: false,
      cancel_on_tap_outside: true,
      ux_mode: 'popup',
    });

    google.accounts.id.renderButton(
      document.getElementById('google-signin-btn'),
      {
        type: 'standard',
        theme: 'filled_black',
        size: 'large',
        text: 'signin_with',
        shape: 'pill',
        width: 340,
      }
    );
  };

  tryInit();
});
