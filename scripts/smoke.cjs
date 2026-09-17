/**
 * Loads dashboard.html under jsdom with a stubbed fetch, then drives the shared
 * API layer to prove it still builds the right requests.
 *
 * There is no build step in this project on purpose, so this has no
 * dependencies of its own — point NODE_PATH at any node_modules with jsdom:
 *
 *   NODE_PATH=../DailyProblemTracker-Service/frontend/node_modules \
 *     node scripts/smoke.cjs
 */
const path = require('path');
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const calls = [];
let nextResponse = () => ({ ok: true, status: 200, json: async () => ({ ok: true }) });

const failures = [];
const check = (name, cond, detail) => {
  if (cond) {
    console.log('  ok    ' + name);
  } else {
    console.log('  FAIL  ' + name + (detail ? ' — ' + detail : ''));
    failures.push(name);
  }
};
const section = (title) => console.log('\n' + title);

(async () => {
  const vc = new VirtualConsole();
  const jsdomErrors = [];
  vc.on('jsdomError', (e) => jsdomErrors.push(e.message.split('\n')[0]));

  const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8'), {
    url: 'http://localhost:5500/dashboard.html',
    runScripts: 'dangerously',
    virtualConsole: vc,
    pretendToBeVisual: true,
  });
  const { window } = dom;

  // A signed-in session, so getToken() does not redirect on sight.
  window.sessionStorage.setItem('gToken', 'test-token');
  window.sessionStorage.setItem('user', JSON.stringify({ id: 7, email: 'a@b.c' }));

  window.fetch = (url, opts) => {
    calls.push(Object.assign({ url: String(url) }, opts || {}));
    return Promise.resolve(nextResponse());
  };

  // Evaluate the local scripts in the order the page declares them.
  const srcs = Array.from(window.document.querySelectorAll('script[src]'))
    .map((s) => s.getAttribute('src'))
    .filter((s) => s && !/^https?:/.test(s));

  section('scripts evaluate, in page order');
  // Injected as real <script> elements rather than window.eval. Indirect eval
  // gets its OWN variable environment, so a top-level `class` or `const` in one
  // call is invisible to the next — which is not how a browser loads these, and
  // would make `class ApiError` look broken when it is not.
  for (const src of srcs) {
    try {
      const tag = window.document.createElement('script');
      tag.textContent = fs.readFileSync(path.join(ROOT, src), 'utf8');
      window.document.head.appendChild(tag);
      check(src, true);
    } catch (e) {
      check(src, false, e.message);
    }
  }

  // Probing lexical globals has the same problem, so route every probe through
  // one injected script that publishes what it can see.
  const probe = (expr) => {
    const tag = window.document.createElement('script');
    tag.textContent = 'window.__probe = (function () { try { return ' + expr +
      '; } catch (e) { return "THREW: " + e.message; } })();';
    window.document.head.appendChild(tag);
    return window.__probe;
  };

  section('globals the page depends on');
  // `class` and `const` at the top level of a classic script are LEXICAL
  // globals: reachable by name from every other script, but never properties
  // of window. Probe by name, not by window lookup.
  const names = ['API_BASE', 'apiFetch', 'ApiError', 'REAUTH_FLAG', 'authHeaders',
    'getCachedUser', 'handleAuthExpiry', 'log', 'signOut', 'kwFetch', 'switchTab'];
  for (const name of names) {
    check(name + ' reachable', probe('typeof ' + name) !== 'undefined', 'missing');
  }

  section('instanceof ApiError spans files');
  // dashboard.js and tracker.js branch on `err instanceof ApiError` while the
  // class is declared in api.js. If lexical scope did not span scripts, every
  // one of those branches would fall through to the generic path instead.
  nextResponse = () => ({ ok: false, status: 500, json: async () => ({}) });
  const spans = await probe(
    '(async () => { try { await apiFetch("/x"); return false; }' +
    ' catch (e) { return e instanceof ApiError; } })()');
  check('a thrown ApiError satisfies instanceof', spans === true, String(spans));

  section('apiFetch builds the request');
  nextResponse = () => ({ ok: true, status: 200, json: async () => ({ ok: true }) });
  calls.length = 0;
  await window.apiFetch('/api/problems', { method: 'POST', body: { title: 'x' } });
  const c = calls[0] || {};
  check('prefixes API_BASE', String(c.url).startsWith(window.API_BASE + '/api/problems'), c.url);
  check('sends the bearer token', (c.headers || {}).Authorization === 'Bearer test-token');
  check('serialises the body exactly once', c.body === '{"title":"x"}', c.body);

  section('kwFetch only supplies the path prefix');
  calls.length = 0;
  await window.kwFetch('/nodes', { method: 'POST', body: { label: 'n' } });
  const k = calls[0] || {};
  check('prefixes /api/knowledge', String(k.url).endsWith('/api/knowledge/nodes'), k.url);
  check('body not double-encoded', k.body === '{"label":"n"}', k.body);

  section('errors carry the server message');
  nextResponse = () => ({ ok: false, status: 400, json: async () => ({ message: 'no key' }) });
  let err = null;
  try { await window.apiFetch('/api/gemini/chat', { method: 'POST', body: {} }); } catch (e) { err = e; }
  check('throws ApiError', err && err.name === 'ApiError', err && err.name);
  check('keeps the message', err && err.message === 'no key', err && err.message);
  check('keeps the status', err && err.status === 400, err && String(err.status));

  section('401 handling is a choice, not an accident');
  nextResponse = () => ({ ok: false, status: 401, json: async () => ({}) });
  err = null;
  try { await window.apiFetch('/api/users/me', { handle401: false }); } catch (e) { err = e; }
  check('handle401:false leaves the session alone',
    err && err.isUnauthorized === true && window.sessionStorage.getItem('gToken') === 'test-token');

  try { await window.apiFetch('/api/problems', { handle401: true }); } catch (e) { /* expected */ }
  check('handle401:true re-authenticates',
    window.sessionStorage.getItem('gToken') === null, 'token should have been cleared');

  section('the link out to the study app');
  const link = window.document.getElementById('prepKitLink');
  check('exists', !!link);
  check('carries no data-tab', link && !link.dataset.tab,
    'a data-tab here would blank the dashboard on click');

  if (jsdomErrors.length) {
    // handleAuthExpiry navigates, which jsdom refuses to do. Expected.
    section('jsdom notices (expected)');
    jsdomErrors.forEach((e) => console.log('  ' + e));
  }

  console.log(failures.length ? '\n' + failures.length + ' failing' : '\nall good');
  process.exit(failures.length ? 1 : 0);
})();
