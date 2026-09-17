/**
 * Smoke test for the module graph.
 *
 * jsdom cannot execute <script type="module">, so this stands up a jsdom
 * window, installs it as the global environment, then imports js/main.js with
 * Node's own ESM loader. That exercises the real graph: every import resolves,
 * nothing fails at module scope, and no cycle leaves a binding in its temporal
 * dead zone.
 *
 * It then checks the two things that fail silently in a project with no build:
 * a data-action in the markup with no handler, and a handler nobody calls.
 *
 *   NODE_PATH=../DailyProblemTracker-Service/frontend/node_modules \
 *     node scripts/smoke.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.slice(1)), '..');
const failures = [];
const check = (name, ok, detail) => {
  console.log((ok ? '  ok    ' : '  FAIL  ') + name + (!ok && detail ? ' — ' + detail : ''));
  if (!ok) failures.push(name);
};
const section = (t) => console.log('\n' + t);

const html = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8');

const vc = new VirtualConsole();
const noticed = [];
vc.on('jsdomError', (e) => noticed.push(e.message.split('\n')[0]));

const dom = new JSDOM(html, {
  url: 'http://localhost:5500/dashboard.html',
  virtualConsole: vc,
  pretendToBeVisual: true,
});
const { window } = dom;

window.sessionStorage.setItem('gToken', 'test-token');
window.sessionStorage.setItem('user', JSON.stringify({ id: 7, email: 'a@b.c' }));

// The modules expect a browser. Install one before importing them.
for (const key of ['window', 'document', 'localStorage', 'sessionStorage',
                   'HTMLElement', 'Element', 'Node', 'MouseEvent', 'Event',
                   'CustomEvent', 'KeyboardEvent', 'getComputedStyle']) {
  Object.defineProperty(globalThis, key, {
    value: window[key], configurable: true, writable: true,
  });
}
Object.defineProperty(globalThis, 'navigator', {
  value: window.navigator, configurable: true, writable: true,
});
globalThis.alert = () => {};
globalThis.confirm = () => true;

const calls = [];
globalThis.fetch = window.fetch = (url, opts) => {
  calls.push(Object.assign({ url: String(url) }, opts || {}));
  return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
};

section('the module graph loads');
let core = null;
let failed = null;
try {
  await import(pathToFileURL(path.join(ROOT, 'js', 'main.js')).href);
  check('js/main.js and everything it imports', true);
} catch (e) {
  failed = e;
  check('js/main.js and everything it imports', false, e.message);
}

if (!failed) {
  core = await import(pathToFileURL(path.join(ROOT, 'js', 'core', 'actions.js')).href);
}

section('every declared intent has a handler');
if (core) {
  const declared = new Set(
    [...html.matchAll(/data-(?:action|enter-action|escape-action)="([^"]+)"/g)].map((m) => m[1]),
  );
  // plus the ones rendered from JS templates
  for (const file of ['js/features/overview.js', 'js/features/workspace.js']) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const m of src.matchAll(/data-action="([^"$]+)"/g)) declared.add(m[1]);
  }
  const registered = new Set(core.registeredActions());

  const missing = [...declared].filter((a) => !registered.has(a));
  const unused = [...registered].filter((a) => !declared.has(a));
  check(`${declared.size} intents in markup, all registered`, missing.length === 0, missing.join(', '));
  check('no handler registered that nothing uses', unused.length === 0, unused.join(', '));
}

section('the shared HTTP layer still behaves');
if (!failed) {
  const httpUrl = pathToFileURL(path.join(ROOT, 'js', 'core', 'http.js')).href;
  const { apiFetch, ApiError } = await import(httpUrl);
  const { API_BASE } = await import(pathToFileURL(path.join(ROOT, 'js', 'core', 'config.js')).href);

  calls.length = 0;
  await apiFetch('/api/problems', { method: 'POST', body: { title: 'x' } });
  const c = calls[0] || {};
  check('prefixes API_BASE', String(c.url).startsWith(API_BASE + '/api/problems'), c.url);
  check('sends the bearer token', (c.headers || {}).Authorization === 'Bearer test-token');
  check('serialises the body exactly once', c.body === '{"title":"x"}', c.body);

  globalThis.fetch = window.fetch = () =>
    Promise.resolve({ ok: false, status: 400, json: async () => ({ message: 'no key' }) });
  let err = null;
  try { await apiFetch('/api/gemini/chat', { method: 'POST', body: {} }); } catch (e) { err = e; }
  check('throws ApiError carrying the server message',
    err instanceof ApiError && err.message === 'no key' && err.status === 400,
    err && err.message);
}

section('the link out to the study app');
const link = window.document.getElementById('prepKitLink');
check('exists', !!link);
check('carries no data-tab', link && !link.dataset.tab,
  'a data-tab here would blank the dashboard on click');

if (noticed.length) {
  section('jsdom notices');
  noticed.forEach((e) => console.log('  ' + e));
}

console.log(failures.length ? `\n${failures.length} failing` : '\nall good');
process.exit(failures.length ? 1 : 0);
