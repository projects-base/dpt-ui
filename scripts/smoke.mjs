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

section('the Interview Kit is a tab, not a way out');
// It used to be an <a target="_blank">, which stranded you in the study app
// with no route back to the dashboard.
const prepTab = window.document.querySelector('.dash-tab[data-tab="prep"]');
const prepPanel = window.document.getElementById('tab-prep');
const prepMount = window.document.getElementById('prepEmbed');
check('sidebar row is a tab like Knowledge Web', !!prepTab);
check('it is not a link', prepTab && prepTab.tagName === 'BUTTON', prepTab && prepTab.tagName);
check('its panel exists', !!prepPanel);
check('the panel has a mount point', !!prepMount);
check('no stranding link remains', !window.document.getElementById('prepKitLink'));

// Every tab in the sidebar should have a panel to show.
const orphanTabs = [...window.document.querySelectorAll('.dash-tab[data-tab]')]
  .map((t) => t.dataset.tab)
  .filter((id) => !window.document.getElementById('tab-' + id));
check('every sidebar tab has a panel', orphanTabs.length === 0, orphanTabs.join(', '));

section('the graph can actually be painted');
// Importing a module proves it parses. It does not prove it runs, and the
// gap between those two bit us: map.js assigned to `_categories`, which it
// imports, and an imported binding is read-only. It threw "Assignment to
// constant variable" at runtime and took the whole Knowledge tab with it.
// Nothing caught it, because nothing ever called the function.
if (!failed) {
  // vis-network is a CDN global the module expects to find.
  class FakeDataSet {
    constructor(items = []) { this.items = [...items]; }
    add(items) { this.items.push(...items); }
    clear() { this.items = []; }
    get(id) { return this.items.find((i) => i.id === id) || null; }
  }
  globalThis.vis = window.vis = { DataSet: FakeDataSet, Network: class { on() {} } };

  const map = await import(pathToFileURL(path.join(ROOT, 'js/features/knowledge/map.js')).href);
  let threw = null;
  try {
    map.applyGraph({
      categories: [{ categoryKey: 'dsa', label: 'DSA', icon: 'D' }],
      nodes: [{ nodeKey: '1', label: 'Root', kind: 'ROOT' }],
      edges: [],
    });
  } catch (e) {
    threw = e;
  }
  check('applyGraph paints a graph without throwing', threw === null, threw && threw.message);
}

section('the design tokens are actually used');
// Thirty distinct font sizes had accumulated across two units — 13px beside
// 13.5px beside 0.86rem, which is 13.76px. None of it was a decision. The
// scale only stays a scale if nothing can quietly add a thirty-first step,
// so a raw font-size outside tokens.css fails here.
{
  const cssFiles = ['css/style.css', 'css/dashboard-ext.css', 'css/legal.css'];
  const raw = [];
  for (const file of cssFiles) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    src.split('\n').forEach((line, i) => {
      const m = line.match(/font-size: *([0-9.]+(?:px|rem|em))/);
      // `font-size: 0` is a hide-the-text trick, not a size.
      if (m && m[1] !== '0') raw.push(`${file}:${i + 1} ${m[1]}`);
    });
  }
  check('every font-size is a token', raw.length === 0, raw.slice(0, 5).join(', '));

  const tokens = fs.readFileSync(path.join(ROOT, 'css/tokens.css'), 'utf8');
  const declared = new Set([...tokens.matchAll(/--([a-z0-9-]+):/g)].map((m) => m[1]));
  const used = new Set();
  for (const file of cssFiles) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const m of src.matchAll(/var\(--([a-z0-9-]+)\)/g)) used.add(m[1]);
  }
  // A var() naming a token that does not exist resolves to nothing and the
  // property is dropped silently — the worst kind of CSS bug.
  const styleVars = new Set(
    [...fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8').matchAll(/--([a-z0-9-]+):/g)].map((m) => m[1]),
  );
  const dangling = [...used].filter((v) => !declared.has(v) && !styleVars.has(v));
  check('no var() points at a token nobody declares', dangling.length === 0, dangling.slice(0, 6).join(', '));

  const withoutRoot = tokens.replace(/:root[\s\S]*?\n}/g, '');
  check('tokens.css declares no selectors',
    !/^[.#a-zA-Z][^{]*{/m.test(withoutRoot),
    'it should hold scales only');
}

section('every panel state comes from one place');
{
  const featureSrc = ['js/features/workspace.js', 'js/features/prep.js']
    .map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8'))
    .join('\n');
  check('no colour hardcoded inside a template string',
    !/style="[^"]*color: *#/.test(featureSrc),
    'use a panel-state modifier instead');
  check('panels render states via ui/states.js',
    /from '\.\.\/ui\/states\.js'/.test(featureSrc));
}

if (noticed.length) {
  section('jsdom notices');
  noticed.forEach((e) => console.log('  ' + e));
}

console.log(failures.length ? `\n${failures.length} failing` : '\nall good');
process.exit(failures.length ? 1 : 0);
