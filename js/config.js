// js/config.js — single source of truth for identity and endpoints.
//
// ⚠ Google's OAuth verification checks "branding consistency": the app name and
// logo on the consent screen, on this site, and on the Chrome Web Store listing
// must all match, and the privacy policy must be hosted on this domain. Change
// the name in ONE place — here — and every page picks it up.

const APP = {
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
const GOOGLE_CLIENT_ID = '683627191123-5551q39di0quqsd7p3oj1nt6oodlajfe.apps.googleusercontent.com';

// Backend API base. Local dev talks to a service on :8080; everything else
// talks to the deployed Render service.
//
// During local development the port can be overridden, for when something else
// already owns 8080:
//     http://localhost:3000/?api=http://localhost:8081
// The choice is remembered in localStorage, so it survives navigation.
//
// The override is deliberately restricted to localhost. Honouring it in
// production would let a crafted link point the dashboard — and the Google ID
// token it carries — at an attacker's server.
const getApiBaseUrl = () => {
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1';

  if (isLocal) {
    const override = new URLSearchParams(window.location.search).get('api');
    if (override) {
      try { localStorage.setItem('dpt_api_base', override); } catch (_) {}
      return override.replace(/\/+$/, '');
    }
    try {
      const saved = localStorage.getItem('dpt_api_base');
      if (saved) return saved.replace(/\/+$/, '');
    } catch (_) {}
    return 'http://localhost:8080';
  }

  return 'https://dpt-service.onrender.com';
};

const API_BASE = getApiBaseUrl();

// Expose globally
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  console.info('[Config] API base is %s (override with ?api=http://localhost:PORT)', API_BASE);
}

window.APP = APP;
window.API_BASE = API_BASE;
window.GOOGLE_CLIENT_ID = GOOGLE_CLIENT_ID;

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
