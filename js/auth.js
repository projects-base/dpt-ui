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

window.addEventListener('load', () => {
  // If already signed in, skip straight to dashboard
  if (sessionStorage.getItem('gToken') && sessionStorage.getItem('user')) {
    window.location.href = '/dashboard.html';
    return;
  }

  // Render GSI button once the library is ready
  const tryInit = () => {
    if (typeof google === 'undefined' || !google.accounts) {
      setTimeout(tryInit, 100);
      return;
    }

    google.accounts.id.initialize({
      // ⚠ Replace with your real Google Client ID
      client_id: '683627191123-5551q39di0quqsd7p3oj1nt6oodlajfe.apps.googleusercontent.com',
      callback: handleGoogleCredential,
      auto_select: false,
      cancel_on_tap_outside: true,
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
