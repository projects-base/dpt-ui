/**
 * Demo mode — every screen filled with plausible data, talking to nothing.
 *
 * ── What this is for ────────────────────────────────────────────────────
 * Seeing what the dashboard looks like with a year of use behind it, without
 * having a year of use behind it. An empty dashboard shows you the empty
 * states and nothing else.
 *
 * ── Why it is not a demo account ────────────────────────────────────────
 * There is no username or password to hand out, because this app has none:
 * the backend is an OAuth2 resource server that accepts Google ID tokens and
 * nothing else. Creating a demo login would mean adding a second way in —
 * to an application wired to a live Neon database. A credential that exists
 * can be shared, leaked and forgotten about; one that does not exist cannot.
 *
 * So demo mode is client-side only, and its safety comes from what it cannot
 * do rather than from what it promises:
 *
 *   • It makes NO requests to OUR backend. `apiFetch` returns from here
 *     before it reaches `fetch`, so the tracker service and its database are
 *     not merely unmodified — they are never contacted. (If the optional
 *     Drive/Sheets ids below are set, those two panels embed public Google
 *     content directly, which is a request to Google and to nobody else.)
 *   • Writes are REFUSED, not faked. Deleting a problem in demo mode tells
 *     you it is a demo rather than quietly pretending it worked.
 *   • It is OFF unless `?demo=1` is in the URL. It cannot switch itself on.
 *   • It stores nothing under the real session's keys, so it cannot end up
 *     holding a live token or clobbering a signed-in user.
 *
 * ── Using it ────────────────────────────────────────────────────────────
 *     http://localhost:3000/dashboard.html?demo=1
 *
 * Add `?demo=0` — or just close the tab — to leave. The flag lives in
 * sessionStorage, so it is per-tab and never outlives the browser session.
 */

const FLAG = 'dpt_demo_mode';

/**
 * Is this tab in demo mode?
 *
 * Read from the URL first so a link always wins, then from sessionStorage so
 * the mode survives in-app navigation. Deliberately never localStorage: demo
 * mode must not be something you turn on once and forget you are in.
 */
export function isDemoMode() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has('demo')) {
      const on = params.get('demo') !== '0' && params.get('demo') !== 'false';
      if (on) sessionStorage.setItem(FLAG, '1');
      else sessionStorage.removeItem(FLAG);
      return on;
    }
    return sessionStorage.getItem(FLAG) === '1';
  } catch (_) {
    // Private mode with storage blocked: fall back to off, never on.
    return false;
  }
}

/* ── Real Google content for the demo (optional) ────────────────────────
   Leave these empty and the Drive and Sheets panels show the fixtures below
   and an honest "not available in the demo" card. Fill them in and those two
   panels show the real thing, read-only.

   Both are EMBEDS, not API calls: no token, no sign-in, nothing to leak. The
   trade-off is that the content must be shared "Anyone with the link →
   Viewer", so treat both as public. Put throwaway sample content in them and
   never anything real.

   To set them up:

     1. In Google Drive, make a folder — e.g. "DPT Demo Docs" — and put two or
        three sample write-ups in it.
        Share → General access → Anyone with the link → Viewer.
        The id is the last path segment of the folder URL:
        drive.google.com/drive/folders/<THIS>

     2. Make a Google Sheet with some sample rows.
        Share it the same way. The id is the segment after /d/ :
        docs.google.com/spreadsheets/d/<THIS>/edit

   Paste the two ids here. Nothing else needs to change. */
export const DEMO_DRIVE_FOLDER_ID = '1l1bWYu6lyhMW32MTUMhtM_bVG-_XPR0_';
export const DEMO_SHEET_ID = '1Cq748eCf70ArNgeEn647s-gXPcVcSG76bNHaLpjNtj0';

/** Drive's own read-only folder listing. No auth, no API key. */
export const demoFolderEmbedUrl = () =>
  `https://drive.google.com/embeddedfolderview?id=${DEMO_DRIVE_FOLDER_ID}#list`;

/** /preview is the viewer — no edit chrome, no toolbar, nothing to click into. */
export const demoSheetEmbedUrl = () =>
  `https://docs.google.com/spreadsheets/d/${DEMO_SHEET_ID}/preview`;

/* ── The cast ──────────────────────────────────────────────────────────── */

export const DEMO_USER = {
  id: 9001,
  name: 'Demo User',
  email: 'demo@example.com',
  role: 'ROLE_USER',
  // A data URI, not a URL: demo mode promises zero network requests, and an
  // <img src="https://..."> would quietly be one.
  pictureUrl:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScxMjgnIGhlaWdodD0nMTI4Jz48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9J2cnIHgxPScwJyB5MT0nMCcgeDI9JzEnIHkyPScxJz48c3RvcCBvZmZzZXQ9JzAnIHN0b3AtY29sb3I9JyM4YjVjZjYnLz48c3RvcCBvZmZzZXQ9JzEnIHN0b3AtY29sb3I9JyM2MzY2ZjEnLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0nMTI4JyBoZWlnaHQ9JzEyOCcgcng9JzY0JyBmaWxsPSd1cmwoI2cpJy8+PHRleHQgeD0nNjQnIHk9Jzg0JyBmb250LWZhbWlseT0nSW50ZXIsc2Fucy1zZXJpZicgZm9udC1zaXplPSc1NicgZm9udC13ZWlnaHQ9JzcwMCcgZmlsbD0nI2ZmZmZmZicgdGV4dC1hbmNob3I9J21pZGRsZSc+RDwvdGV4dD48L3N2Zz4=',
};

/** Dates relative to now, so the demo never looks abandoned. */
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

const PROBLEMS = [
  ['Two Sum', 'EASY', 0, 'array,hash-table', 'two-sum'],
  ['Longest Substring Without Repeating Characters', 'MEDIUM', 0, 'string,sliding-window', 'longest-substring-without-repeating-characters'],
  ['Merge Intervals', 'MEDIUM', 1, 'array,sorting', 'merge-intervals'],
  ['LRU Cache', 'MEDIUM', 1, 'design,hash-table,linked-list', 'lru-cache'],
  ['Number of Islands', 'MEDIUM', 2, 'graph,bfs,dfs', 'number-of-islands'],
  ['Trapping Rain Water', 'HARD', 2, 'array,two-pointers,stack', 'trapping-rain-water'],
  ['Validate Binary Search Tree', 'MEDIUM', 3, 'tree,dfs', 'validate-binary-search-tree'],
  ['Course Schedule', 'MEDIUM', 4, 'graph,topological-sort', 'course-schedule'],
  ['Serialize and Deserialize Binary Tree', 'HARD', 5, 'tree,design', 'serialize-and-deserialize-binary-tree'],
  ['Product of Array Except Self', 'MEDIUM', 5, 'array,prefix-sum', 'product-of-array-except-self'],
  ['Valid Parentheses', 'EASY', 6, 'string,stack', 'valid-parentheses'],
  ['Kth Largest Element in an Array', 'MEDIUM', 7, 'heap,quickselect', 'kth-largest-element-in-an-array'],
  ['Word Ladder', 'HARD', 8, 'graph,bfs', 'word-ladder'],
  ['Climbing Stairs', 'EASY', 9, 'dp', 'climbing-stairs'],
  ['Coin Change', 'MEDIUM', 10, 'dp', 'coin-change'],
  ['Binary Tree Level Order Traversal', 'MEDIUM', 11, 'tree,bfs', 'binary-tree-level-order-traversal'],
  ['Median of Two Sorted Arrays', 'HARD', 12, 'array,binary-search', 'median-of-two-sorted-arrays'],
  ['Group Anagrams', 'MEDIUM', 13, 'string,hash-table', 'group-anagrams'],
  ['Reverse Linked List', 'EASY', 14, 'linked-list', 'reverse-linked-list'],
  ['Min Stack', 'EASY', 15, 'design,stack', 'min-stack'],
  ['Rotting Oranges', 'MEDIUM', 16, 'graph,bfs', 'rotting-oranges'],
  ['Longest Palindromic Substring', 'MEDIUM', 18, 'string,dp', 'longest-palindromic-substring'],
  ['Maximum Subarray', 'EASY', 20, 'array,dp', 'maximum-subarray'],
  ['Find Median from Data Stream', 'HARD', 22, 'heap,design', 'find-median-from-data-stream'],
  ['Search in Rotated Sorted Array', 'MEDIUM', 24, 'array,binary-search', 'search-in-rotated-sorted-array'],
].map(([title, difficulty, ago, tags, slug], i) => ({
  id: 5000 + i,
  title,
  difficulty,
  tags,
  solvedAt: daysAgo(ago),
  url: `https://leetcode.com/problems/${slug}/`,
  userId: DEMO_USER.id,
}));

const ANALYTICS = {
  totalProblems: PROBLEMS.length,
  easyCount: PROBLEMS.filter((p) => p.difficulty === 'EASY').length,
  mediumCount: PROBLEMS.filter((p) => p.difficulty === 'MEDIUM').length,
  hardCount: PROBLEMS.filter((p) => p.difficulty === 'HARD').length,
  streak: 7,
};

const CATEGORIES = [
  { categoryKey: 'sysdesign', label: 'System Design', icon: '🏛', pillarNodeKey: 'p-sys',
    colorBg: 'rgba(99,102,241,0.16)', colorBorder: '#6366f1', colorFont: '#e0e7ff', builtIn: true },
  { categoryKey: 'logic', label: 'Quick Logic', icon: '⚡', pillarNodeKey: 'p-logic',
    colorBg: 'rgba(245,158,11,0.16)', colorBorder: '#f59e0b', colorFont: '#fde68a', builtIn: true },
  { categoryKey: 'deepdive', label: 'Deep Dive', icon: '📼', pillarNodeKey: 'p-deep',
    colorBg: 'rgba(16,185,129,0.16)', colorBorder: '#10b981', colorFont: '#a7f3d0', builtIn: true },
  { categoryKey: 'article', label: 'Article', icon: '📄', pillarNodeKey: 'p-article',
    colorBg: 'rgba(139,92,246,0.16)', colorBorder: '#8b5cf6', colorFont: '#ddd6fe', builtIn: true },
];

const KNOWLEDGE_NODES = [
  { nodeKey: 'root', label: 'My Knowledge', icon: '🧠', kind: 'ROOT', categoryKey: null, url: null },
  { nodeKey: 'p-sys', label: 'System Design', icon: '🏛', kind: 'PILLAR', categoryKey: 'sysdesign', url: null },
  { nodeKey: 'p-logic', label: 'Quick Logic', icon: '⚡', kind: 'PILLAR', categoryKey: 'logic', url: null },
  { nodeKey: 'p-deep', label: 'Deep Dive', icon: '📼', kind: 'PILLAR', categoryKey: 'deepdive', url: null },
  { nodeKey: 'p-article', label: 'Article', icon: '📄', kind: 'PILLAR', categoryKey: 'article', url: null },

  { nodeKey: 'n1', label: 'CAP theorem', icon: '🏛', kind: 'RESOURCE', categoryKey: 'sysdesign',
    url: 'https://en.wikipedia.org/wiki/CAP_theorem', notes: 'Pick two, and say which you dropped and why.' },
  { nodeKey: 'n2', label: 'Consistent hashing', icon: '🏛', kind: 'RESOURCE', categoryKey: 'sysdesign',
    url: 'https://en.wikipedia.org/wiki/Consistent_hashing', notes: 'Virtual nodes are what make it even.' },
  { nodeKey: 'n3', label: 'Idempotency keys', icon: '🏛', kind: 'RESOURCE', categoryKey: 'sysdesign',
    url: null, notes: 'Unique constraint on the key; return the stored response on retry.' },
  { nodeKey: 'n4', label: 'Monotonic stack', icon: '⚡', kind: 'RESOURCE', categoryKey: 'logic',
    url: null, notes: 'Turns several O(n²) scans into O(n).' },
  { nodeKey: 'n5', label: 'Binary search on the answer', icon: '⚡', kind: 'RESOURCE', categoryKey: 'logic',
    url: null, notes: 'Search a value range, not an array.' },
  { nodeKey: 'n6', label: 'JVM memory model', icon: '📼', kind: 'RESOURCE', categoryKey: 'deepdive',
    url: null, notes: 'Heap, metaspace, stacks — and what happens on a full GC.' },
  { nodeKey: 'n7', label: 'HashMap treeification', icon: '📼', kind: 'RESOURCE', categoryKey: 'deepdive',
    url: null, notes: 'Bucket becomes a red-black tree at 8 entries, back to a list at 6.' },
  { nodeKey: 'n8', label: 'Transactional outbox', icon: '📄', kind: 'RESOURCE', categoryKey: 'article',
    url: null, notes: 'The named answer to "DB write plus Kafka publish".' },
];

const KNOWLEDGE_EDGES = [
  { from: 'root', to: 'p-sys' }, { from: 'root', to: 'p-logic' },
  { from: 'root', to: 'p-deep' }, { from: 'root', to: 'p-article' },
  { from: 'p-sys', to: 'n1' }, { from: 'p-sys', to: 'n2' }, { from: 'p-sys', to: 'n3' },
  { from: 'p-logic', to: 'n4' }, { from: 'p-logic', to: 'n5' },
  { from: 'p-deep', to: 'n6' }, { from: 'p-deep', to: 'n7' },
  { from: 'p-article', to: 'n8' },
];

const SETTINGS = {
  geminiApiKey: '',
  geminiModel: 'gemini-2.0-flash',
  driveFolderId: '',
  sheetId: '',
};

/**
 * Drive and Sheets are the two panels that do NOT go through apiFetch — they
 * talk to Google directly with a different token. Demo mode cannot intercept
 * them at the HTTP layer, so those panels ask for these by name instead.
 *
 * Nothing here is a real Drive file. The links are inert.
 */
export const DEMO_DRIVE_DOCS = [
  { name: 'Two Sum — approach and complexity', daysAgo: 0 },
  { name: 'LRU Cache — design notes', daysAgo: 1 },
  { name: 'Number of Islands — BFS vs DFS', daysAgo: 2 },
  { name: 'Trapping Rain Water — the two-pointer proof', daysAgo: 2 },
  { name: 'Course Schedule — cycle detection', daysAgo: 4 },
  { name: 'Weekly review — week of 14 Sept', daysAgo: 4 },
].map((d, i) => ({
  id: 'demo-doc-' + i,
  name: d.name,
  createdTime: daysAgo(d.daysAgo),
  webViewLink: null,          // inert: there is nothing real to open
}));

/* ── The router ────────────────────────────────────────────────────────── */

/** Thrown for anything that would change data. Mirrors ApiError's shape. */
class DemoReadOnly extends Error {
  constructor(what) {
    super(`Demo mode is read-only — ${what} is disabled here.`);
    this.name = 'ApiError';
    this.status = 403;
  }
  get isUnauthorized() { return false; }
}

/**
 * Answers an API path from the fixtures above.
 *
 * @param {string} path   the path apiFetch was given
 * @param {string} method the HTTP method it would have used
 * @returns {Promise<*>} what the real endpoint would have returned
 * @throws {DemoReadOnly} for any write
 */
export function demoRespond(path, method = 'GET') {
  const verb = method.toUpperCase();

  if (verb !== 'GET') {
    if (path.startsWith('/api/problems')) return Promise.reject(new DemoReadOnly('saving or deleting a problem'));
    if (path.startsWith('/api/knowledge')) return Promise.reject(new DemoReadOnly('editing the knowledge map'));
    if (path.startsWith('/api/users/me/settings')) return Promise.reject(new DemoReadOnly('changing settings'));
    if (path.startsWith('/api/gemini')) return Promise.reject(new DemoReadOnly('the AI assistant'));
    return Promise.reject(new DemoReadOnly('this action'));
  }

  if (path.startsWith('/api/users/me/settings')) return Promise.resolve(SETTINGS);
  if (path.startsWith('/api/users/me')) return Promise.resolve(DEMO_USER);
  if (path.startsWith('/api/problems/user/')) return Promise.resolve(PROBLEMS);
  if (path.startsWith('/api/analytics')) return Promise.resolve(ANALYTICS);
  if (path.startsWith('/api/knowledge')) {
    return Promise.resolve({
      nodes: KNOWLEDGE_NODES,
      edges: KNOWLEDGE_EDGES,
      categories: CATEGORIES,
    });
  }
  if (path.startsWith('/api/gemini/models')) return Promise.resolve({ models: [] });

  // An unmapped GET returns empty rather than throwing: a panel we forgot
  // should look unused, not broken.
  return Promise.resolve(null);
}

/**
 * The banner. Demo data that is not obviously demo data is a trap — you end up
 * reading a number off the screen and believing it.
 */
export function showDemoBanner() {
  if (document.getElementById('demoBanner')) return;
  const bar = document.createElement('div');
  bar.id = 'demoBanner';
  bar.className = 'demo-banner';
  // Precise, not just reassuring: with the Drive/Sheets ids set, those two
  // panels DO fetch from Google. What never happens is a call to our backend.
  bar.innerHTML =
    '<strong>Demo mode</strong> — sample data, nothing is saved, and the tracker service is never called. ' +
    '<a href="?demo=0">Leave demo</a>';
  document.body.prepend(bar);
  document.body.classList.add('has-demo-banner');
}
