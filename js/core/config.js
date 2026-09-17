// js/config.js — single source of truth for identity and endpoints.
//
// ⚠ Google's OAuth verification checks "branding consistency": the app name and
// logo on the consent screen, on this site, and on the Chrome Web Store listing
// must all match, and the privacy policy must be hosted on this domain. Change
// the name in ONE place — here — and every page picks it up.

export const APP = {
  // Must match, character for character:
  //   • manifest.json  → "name"
  //   • Google Cloud Console → OAuth consent screen → "App name"
  //   • Chrome Web Store listing title
  name: 'Daily Problem Dynamic Tracker',

  // Short name for tight spaces (nav bar). Never used where Google reviews branding.
  shortName: 'DPT',

  // TODO: replace once the site is deployed. This exact origin must be entered as
  // the "Application home page" on the OAuth consent screen, and be verified in
  // Google Search Console under the same account that owns the Cloud project.
  siteUrl: 'https://YOUR-SITE.netlify.app',

  // TODO: replace with the real listing URL after the extension is published.
  // Until then the homepage links to the install instructions instead.
  webStoreUrl: '',

  // Shown on the privacy policy and used as the OAuth support contact.
  supportEmail: 'kumarks@signiasoftware.com',

  privacyUrl: '/privacy.html',
  termsUrl: '/terms.html',
};

// Google OAuth 2.0 Client ID — must equal app.google.client-id on the backend
// and manifest.json → oauth2.client_id in the extension.
export const GOOGLE_CLIENT_ID = '683627191123-5551q39di0quqsd7p3oj1nt6oodlajfe.apps.googleusercontent.com';

// Backend API base. Local dev talks to a service on :8080; everything else
// talks to the deployed Render service.
//
// During local development the port can be overridden, for when something else
// already owns 8080:
//     http://localhost:3000/?api=http://localhost:8081   set it
//     http://localhost:3000/?api=                        clear it, back to 8080
// The choice is remembered in localStorage, so it survives navigation.
//
// A remembered override that points at a port nothing is listening on shows up
// as "Failed to fetch" on every call, with no clue why — hence the explicit
// clear above, and the console line below naming the base actually in use.
//
// The override is deliberately restricted to localhost. Honouring it in
// production would let a crafted link point the dashboard — and the Google ID
// token it carries — at an attacker's server.
export const API_BASE_OVERRIDE_KEY = 'dpt_api_base';

const getApiBaseUrl = () => {
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1';

  if (isLocal) {
    const params = new URLSearchParams(window.location.search);

    if (params.has('api')) {
      const override = (params.get('api') || '').trim();
      // An empty ?api= means "forget the override" rather than "use nothing".
      if (!override) {
        try { localStorage.removeItem(API_BASE_OVERRIDE_KEY); } catch (_) {}
        return 'http://localhost:8080';
      }
      try { localStorage.setItem(API_BASE_OVERRIDE_KEY, override); } catch (_) {}
      return override.replace(/\/+$/, '');
    }

    try {
      const saved = localStorage.getItem(API_BASE_OVERRIDE_KEY);
      if (saved) return saved.replace(/\/+$/, '');
    } catch (_) {}
    return 'http://localhost:8080';
  }

  return 'https://dpt-service.onrender.com';
};

/** Clears a remembered local API override. Callable from the console. */
export function resetApiBase() {
  try { localStorage.removeItem(API_BASE_OVERRIDE_KEY); } catch (_) {}
  window.location.reload();
}

export const API_BASE = getApiBaseUrl();

// Expose globally
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  let saved = null;
  try { saved = localStorage.getItem(API_BASE_OVERRIDE_KEY); } catch (_) {}
  if (saved) {
    console.warn(
      '[Config] API base is %s — a REMEMBERED override, not the default. ' +
      'If requests are failing, clear it with ?api= or resetApiBase().', API_BASE);
  } else {
    console.info('[Config] API base is %s (override with ?api=http://localhost:PORT)', API_BASE);
  }
}


// Stamp the app name into any element marked data-app-name, so the branding
// Google reviews can never drift out of sync with the consent screen.
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-app-name]').forEach(el => { el.textContent = APP.name; });
  document.querySelectorAll('[data-app-email]').forEach(el => {
    el.textContent = APP.supportEmail;
    if (el.tagName === 'A') el.href = `mailto:${APP.supportEmail}`;
  });
  document.querySelectorAll('[data-store-link]').forEach(el => {
    if (APP.webStoreUrl) el.href = APP.webStoreUrl;
    else el.removeAttribute('href');
  });
});

// resetApiBase is a console affordance for switching environments by hand.
window.resetApiBase = resetApiBase;
