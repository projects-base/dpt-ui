/**
 * dashboard.js — Dashboard logic for Daily Problem Tracker
 *
 * Loads user profile and problems from the backend using the Google ID token
 * stored in sessionStorage. Renders stats, problem list, and profile card.
 */

// API_BASE is now globally provided by config.js

// ── Debug Logger ────────────────────────────────────────────────
function log(msg, isError = false) {
  if (isError) {
    console.error(`[Dashboard] ${msg}`);
  } else {
    console.log(`[Dashboard] ${msg}`);
  }
}

// ── Auth guard ───────────────────────────────────────────────────

function getToken() {
  const token = sessionStorage.getItem('gToken');
  if (!token) {
    window.location.href = '/index.html';
    return null;
  }
  return token;
}

/**
 * Google ID tokens expire after about an hour, after which every API call
 * returns 401 and the dashboard used to sit there showing stale cached data
 * with no way back. Send the user to sign in again instead.
 *
 * Guarded against a redirect loop: if signing in again still produces a 401
 * (a genuine backend/audience misconfiguration rather than an expired token)
 * we stop bouncing and surface the error.
 */
const REAUTH_FLAG = 'dpt_reauth_attempted';

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
  let bar = el('sessionBanner');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'sessionBanner';
    bar.className = 'session-banner';
    document.body.prepend(bar);
  }
  bar.textContent = message;
  bar.style.display = 'block';
}

function getCachedUser() {
  const raw = sessionStorage.getItem('user');
  return raw ? JSON.parse(raw) : null;
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getToken()}`,
  };
}

// ── Sign out ─────────────────────────────────────────────────────

function signOut() {
  sessionStorage.removeItem('gToken');
  sessionStorage.removeItem('user');
  sessionStorage.removeItem(REAUTH_FLAG);
  // Forget the remembered Google account, so the next sign-in shows the full
  // account chooser instead of jumping straight back into the same one.
  try { google?.accounts?.id?.disableAutoSelect(); } catch (_) {}
  window.location.href = '/index.html';
}

// ── Render helpers ───────────────────────────────────────────────

function el(id) { return document.getElementById(id); }

function getDifficultyClass(diff) {
  switch ((diff || '').toUpperCase()) {
    case 'EASY':   return 'diff-easy';
    case 'MEDIUM': return 'diff-medium';
    case 'HARD':   return 'diff-hard';
    default:       return 'diff-easy';
  }
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function renderUserProfile(user) {
  // Navbar
  if (user.pictureUrl) {
    el('userAvatar').src = user.pictureUrl;
    el('profileAvatar').src = user.pictureUrl;
  }
  el('userNameNav').textContent  = user.name  || '—';
  el('userEmailNav').textContent = user.email || '—';

  // Profile card
  el('profileName').textContent  = user.name  || '—';
  el('profileEmail').textContent = user.email || '—';
  el('userRoleBadge').textContent = (user.role || 'USER').replace('ROLE_', '');

  // Welcome banner
  const firstName = (user.name || 'there').split(' ')[0];
  el('welcomeName').textContent = firstName;

  // Update greeting based on time of day.
  // Built with textContent, not innerHTML — firstName comes from the Google
  // profile and must never be parsed as markup.
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const titleEl = el('welcomeBanner').querySelector('.welcome-title');
  titleEl.textContent = `${greeting}, `;
  const nameEl = document.createElement('span');
  nameEl.id = 'welcomeName';
  nameEl.textContent = firstName;
  titleEl.append(nameEl, ' ' + String.fromCodePoint(0x1F44B));
}

function renderProblems(problems) {
  const list      = el('problemList');
  const emptyState = el('problemEmptyState');

  if (!problems || problems.length === 0) {
    emptyState.style.display = 'block';
    // Clear old items
    list.querySelectorAll('.problem-item').forEach(n => n.remove());
    return;
  }
  emptyState.style.display = 'none';

  // Clear old items
  list.querySelectorAll('.problem-item').forEach(n => n.remove());

  problems.forEach(p => {
    const diff = (p.difficulty || 'EASY').toUpperCase();
    const tags = (p.tags || '').split(',').filter(t => t.trim()).slice(0, 3);

    const item = document.createElement('div');
    item.className = 'problem-item';
    item.innerHTML = `
      <span class="problem-difficulty ${getDifficultyClass(diff)}">${diff}</span>
      <div class="problem-info">
        <div class="problem-title">${escapeHtml(p.title)}</div>
        <div class="problem-meta">${formatDate(p.solvedAt)}</div>
      </div>
      ${tags.length ? `<div class="problem-tags">${tags.map(t => `<span class="tag">${escapeHtml(t.trim())}</span>`).join('')}</div>` : ''}
      <button class="problem-delete-btn" title="Delete problem" onclick="deleteProblem(event, ${p.id})">✕</button>
    `;
    if (p.url) {
      item.style.cursor = 'pointer';
      item.title = 'Open on LeetCode';
      item.querySelector('.problem-info').addEventListener('click', () => window.open(p.url, '_blank'));
    }
    list.appendChild(item);
  });
}

async function deleteProblem(event, problemId) {
  event.stopPropagation();
  if (!confirm('Delete this problem from your dashboard?')) return;
  try {
    const res = await fetch(`${API_BASE}/api/problems/${problemId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (res.status === 401) { handleAuthExpiry(); return; }
    if (!res.ok) throw new Error(`Delete failed (HTTP ${res.status})`);
    await refreshOverview();
  } catch (err) {
    alert('Could not delete problem: ' + err.message);
  }
}

function renderAnalytics(analytics) {
  if (!analytics) return;
  el('totalProblems').textContent = analytics.totalProblems || 0;
  el('easyCount').textContent     = analytics.easyCount || 0;
  el('mediumCount').textContent   = analytics.mediumCount || 0;
  el('hardCount').textContent     = analytics.hardCount || 0;
  el('profileTotal').textContent  = analytics.totalProblems || 0;
  el('streakCount').textContent   = analytics.streak || 0;
  el('profileStreak').textContent = analytics.streak || 0;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Add Problem Modal ─────────────────────────────────────────────

function openAddProblemModal() {
  el('modalOverlay').style.display = 'flex';
  el('addProblemModal').style.animation = 'fadeSlideUp 0.25s ease';
  el('problemTitle').focus();
}

function closeAddProblemModal() {
  el('modalOverlay').style.display = 'none';
  el('addProblemForm').reset();
}

async function submitProblem(event) {
  event.preventDefault();
  const btn = el('submitProblemBtn');
  btn.textContent = 'Adding…';
  btn.disabled = true;

  try {
    const user = getCachedUser();
    if (!user) throw new Error('You are not signed in.');

    const title = el('problemTitle').value.trim();
    if (!title) throw new Error('Title is required.');

    // The server takes the owner from the auth token, so no user id is sent.
    const payload = {
      title,
      url:        el('problemUrl').value.trim() || null,
      difficulty: el('problemDifficulty').value,
      tags:       el('problemTags').value.trim() || null,
      notes:      el('problemNotes').value.trim() || null,
    };

    const res = await fetch(`${API_BASE}/api/problems`, {
      method:  'POST',
      headers: authHeaders(),
      body:    JSON.stringify(payload),
    });

    if (res.status === 401) { handleAuthExpiry(); return; }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Failed to add problem (HTTP ${res.status})`);
    }

    closeAddProblemModal();
    // Repaint the list and the stat tiles. This used to call loadProblems()
    // and throw the result away, so a newly added problem only showed up
    // after a manual page refresh.
    await refreshOverview();
  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    btn.textContent = 'Add Problem';
    btn.disabled = false;
  }
}

/** Reloads problems + analytics and repaints the overview tab. */
async function refreshOverview() {
  const user = getCachedUser();
  if (!user) return;
  const [problems, analytics] = await Promise.all([
    loadProblems(user.id),
    loadAnalytics(user.id),
  ]);
  renderProblems(problems);
  if (analytics) renderAnalytics(analytics);
}

// ── API calls ─────────────────────────────────────────────────────

async function loadMe() {
  log('Fetching profile from /api/users/me...');
  try {
    const res = await fetch(`${API_BASE}/api/users/me`, { headers: authHeaders() });
    log(`Profile response status: ${res.status}`);

    // A 401 here means the Google ID token expired (they last ~1 hour) or was
    // issued for a different client ID.
    if (res.status === 401) {
      log('401 from /api/users/me — session expired, re-authenticating', true);
      if (handleAuthExpiry()) return null;
      return getCachedUser();
    }
    if (!res.ok) {
      log(`API error: ${res.status} ${res.statusText}`, true);
      return getCachedUser(); // Degrade gracefully instead of looping
    }
    sessionStorage.removeItem(REAUTH_FLAG); // token works; reset the loop guard
    return res.json();
  } catch (err) {
    log(`Network or parser error: ${err.message} — using cached profile`, true);
    showSessionBanner('Could not reach the server. Showing your last cached data.');
    return getCachedUser(); // Network failure: still show dashboard with cached data
  }
}

async function loadProblems(userId) {
  log('Loading problems from /api/problems/user/' + userId + '...');
  try {
    const res = await fetch(`${API_BASE}/api/problems/user/${userId}`, { headers: authHeaders() });
    if (!res.ok) {
      log(`Problems API error: ${res.status}`, true);
      return [];
    }
    return res.json();
  } catch (err) {
    log(`Failed to load problems: ${err.message}`, true);
    return [];
  }
}

async function loadAnalytics(userId) {
  log(`Loading analytics from /api/analytics/user/${userId}...`);
  try {
    const res = await fetch(`${API_BASE}/api/analytics/user/${userId}`, { headers: authHeaders() });
    if (!res.ok) {
      log(`Analytics API error: ${res.status}`, true);
      return null;
    }
    return res.json();
  } catch (err) {
    log(`Failed to load analytics: ${err.message}`, true);
    return null;
  }
}

/** Fetch analytics for the currently authenticated user via the /me shortcut. */
async function loadMyAnalytics() {
  log('Loading analytics from /api/analytics/me...');
  try {
    const res = await fetch(`${API_BASE}/api/analytics/me`, { headers: authHeaders() });
    if (!res.ok) {
      log(`Analytics /me error: ${res.status}`, true);
      return null;
    }
    return res.json();
  } catch (err) {
    log(`Failed to load /me analytics: ${err.message}`, true);
    return null;
  }
}

// ── Code Portals ───────────────────────────────────────────────────

// The original provider (leetcode-stats-api.herokuapp.com) went away with
// Heroku's free tier and had been returning 503 for every request. This mirror
// serves the same JSON shape.
const LEETCODE_STATS_API = 'https://leetcode-stats-api.vercel.app';

/**
 * Portal sync buttons are wired through inline onclick, so the event object was
 * being read off the implicit global. Passing it in explicitly keeps the button
 * reference valid and lets these be called from anywhere.
 */
async function fetchLeetcodeStats(event) {
  const user = el('leetcodeUser').value.trim();
  if (!user) {
    alert('Please enter a LeetCode username');
    return;
  }
  const btn = event?.currentTarget || el('lcSyncBtn');
  await withSyncingButton(btn, async () => {
    const res = await fetch(`${LEETCODE_STATS_API}/${encodeURIComponent(user)}`);
    const data = await res.json().catch(() => null);

    // The mirror reports an unknown user as a GraphQL `errors` array rather
    // than a status field, so check for the payload we actually need.
    if (!res.ok || !data || data.errors || typeof data.totalSolved !== 'number') {
      alert(`Could not load LeetCode stats for "${user}". Check the username is correct.`);
      return;
    }

    el('lcSolved').textContent = data.totalSolved;
    el('lcRank').textContent   = data.ranking ? data.ranking.toLocaleString() : '—';
    el('leetcodeStats').style.display = 'flex';
    localStorage.setItem('dpt_lc_user', user);
  }, 'LeetCode');
}

async function fetchGithubStats(event) {
  const user = el('githubUser').value.trim();
  if (!user) {
    alert('Please enter a GitHub username');
    return;
  }
  const btn = event?.currentTarget || el('ghSyncBtn');
  await withSyncingButton(btn, async () => {
    const res = await fetch(`https://api.github.com/users/${encodeURIComponent(user)}`);
    if (res.status === 404) {
      alert(`GitHub user "${user}" not found.`);
      return;
    }
    if (res.status === 403) {
      alert('GitHub rate limit reached. Try again in a few minutes.');
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    el('ghRepos').textContent     = data.public_repos ?? 0;
    el('ghFollowers').textContent = data.followers ?? 0;
    el('githubStats').style.display = 'flex';
    localStorage.setItem('dpt_gh_user', user);
  }, 'GitHub');
}

/** Runs `work` with the button showing a busy label, restoring it either way. */
async function withSyncingButton(btn, work, label) {
  const original = btn ? btn.textContent : null;
  if (btn) { btn.textContent = 'Syncing...'; btn.disabled = true; }
  try {
    await work();
  } catch (e) {
    alert(`Could not reach the ${label} API: ${e.message}`);
  } finally {
    if (btn) { btn.textContent = original || 'Sync Stats'; btn.disabled = false; }
  }
}

// ── System Design Hub ────────────────────────────────────────────────

const sysDesignData = {
  'load-balancing': {
    title: 'Load Balancing',
    tags: ['Architecture', 'Scalability'],
    body: `<p>Load balancing is the process of distributing network traffic across multiple servers. This ensures no single server bears too much demand. By spreading the work evenly, load balancing improves application responsiveness.</p>
    <h4>Common Algorithms</h4>
    <ul>
      <li><strong>Round Robin:</strong> Requests are distributed across the group of servers sequentially.</li>
      <li><strong>Least Connections:</strong> Sends requests to the server with the fewest current connections.</li>
      <li><strong>IP Hash:</strong> Determines which server receives the request based on the client's IP.</li>
    </ul>`
  },
  'caching': {
    title: 'Caching Strategies',
    tags: ['Performance', 'Data'],
    body: `<p>Caching involves storing copies of frequently accessed data in a fast temporary storage (like RAM) to reduce latency and database load.</p>
    <h4>Common Patterns</h4>
    <ul>
      <li><strong>Cache-Aside:</strong> Application checks cache first; if miss, fetches from DB and populates cache.</li>
      <li><strong>Write-Through:</strong> Data is written into the cache and the backing store at the same time.</li>
      <li><strong>Tools:</strong> Redis, Memcached, CDNs.</li>
    </ul>`
  },
  'databases': {
    title: 'Databases (SQL vs NoSQL)',
    tags: ['Storage', 'ACID'],
    body: `<p>Choosing the right database depends on the data structure, read/write ratio, and scale.</p>
    <h4>Key Concepts</h4>
    <ul>
      <li><strong>SQL:</strong> Relational, ACID compliant, vertical scaling (typically), strict schema (PostgreSQL, MySQL).</li>
      <li><strong>NoSQL:</strong> Non-relational, BASE compliant, horizontal scaling, flexible schema (MongoDB, Cassandra).</li>
      <li><strong>Sharding:</strong> Distributing data across multiple databases to scale horizontally.</li>
    </ul>`
  },
  'messaging': {
    title: 'Message Queues',
    tags: ['Asynchronous', 'Decoupling'],
    body: `<p>Message queues facilitate asynchronous communication between microservices, allowing them to scale independently and loosely couple.</p>
    <h4>Tools & Patterns</h4>
    <ul>
      <li><strong>Kafka:</strong> High-throughput distributed commit log (event streaming).</li>
      <li><strong>RabbitMQ:</strong> Advanced routing and traditional message brokering.</li>
      <li><strong>Fan-out:</strong> A single message is delivered to multiple consuming services.</li>
    </ul>`
  },
  'cdn': {
    title: 'CDN & Edge Computing',
    tags: ['Performance', 'Network'],
    body: `<p>A Content Delivery Network (CDN) is a geographically distributed network of servers that caches content close to end-users, reducing latency dramatically.</p>
    <h4>Key Concepts</h4>
    <ul>
      <li><strong>PoP (Point of Presence):</strong> Edge locations where CDN servers are deployed globally.</li>
      <li><strong>Cache-Control Headers:</strong> Tell CDN how long to cache an object (TTL).</li>
      <li><strong>Cache Invalidation:</strong> Purging stale content (one of the hardest problems).</li>
      <li><strong>Tools:</strong> AWS CloudFront, Cloudflare, Akamai, Fastly.</li>
    </ul>`
  },
  'api-gateway': {
    title: 'API Gateway',
    tags: ['Architecture', 'Security'],
    body: `<p>An API Gateway is a server that acts as an entry point for clients into a microservices architecture. It handles cross-cutting concerns in one place.</p>
    <h4>Responsibilities</h4>
    <ul>
      <li><strong>Rate Limiting:</strong> Protect backend services from being overwhelmed.</li>
      <li><strong>Authentication:</strong> Validate JWT/OAuth tokens before forwarding requests.</li>
      <li><strong>Routing:</strong> Route requests to the correct downstream microservice.</li>
      <li><strong>Tools:</strong> AWS API Gateway, Kong, NGINX, Traefik.</li>
    </ul>`
  }
};

function selectSysTopic(topicId) {
  // Update active card
  document.querySelectorAll('.sys-topic-card').forEach(card => card.classList.remove('active'));
  const activeCard = Array.from(document.querySelectorAll('.sys-topic-card')).find(c => c.getAttribute('onclick').includes(topicId));
  if (activeCard) activeCard.classList.add('active');

  const data = sysDesignData[topicId];
  if (data) {
    el('sysReaderTitle').textContent = data.title;
    el('sysReaderBody').innerHTML = data.body;
    
    const tagsWrapper = document.querySelector('.sys-tags');
    tagsWrapper.innerHTML = data.tags.map(t => `<span class="sys-badge">${t}</span>`).join('');
  }
}

// ── Knowledge Web ──────────────────────────────────────────────────
//
// The map is stored server-side (/api/knowledge), so it follows the user
// between browsers and devices. It previously lived only in localStorage —
// tied to one browser profile, and one cache-clear away from being lost.
// Any map still sitting in localStorage is migrated up on first load.

let network = null;
let nodes   = null;
let edges   = null;
let _selectedNodeId = null;
let _categories = [];

// Legacy localStorage keys: read once for migration, then left alone.
const KW_STORAGE_KEY  = 'dpt_knowledge_web';
const KW_CAT_KEY      = 'dpt_kw_categories';
const KW_MIGRATED_KEY = 'dpt_kw_migrated';

const ROOT_STYLE = {
  shape: 'ellipse',
  size: 28,
  color: {
    background: '#6366f1', border: '#4f46e5',
    highlight: { background: '#7c3aed', border: '#6d28d9' },
  },
  font: { color: 'white', size: 14, bold: true },
};

const FALLBACK_COLORS = { bg: '#1e1b4b', border: '#3730a3', font: '#a5b4fc' };

function categoryByKey(key) {
  return _categories.find(c => c.categoryKey === key) || null;
}

/** Converts a stored node into the shape vis-network expects. */
function toVisNode(node) {
  const label = (node.icon ? node.icon + ' ' : '') + node.label;

  if (node.kind === 'ROOT') {
    // kind must survive onto the vis node: the click handler and the delete
    // guard both read it to keep the root from being removed.
    return { id: node.nodeKey, label, kind: node.kind, ...ROOT_STYLE };
  }

  const cat = categoryByKey(node.categoryKey);
  const bg     = (cat && cat.colorBg)     || FALLBACK_COLORS.bg;
  const border = (cat && cat.colorBorder) || FALLBACK_COLORS.border;
  const font   = (cat && cat.colorFont)   || FALLBACK_COLORS.font;

  return {
    id: node.nodeKey,
    label,
    shape: 'box',
    color: { background: bg, border },
    font: { color: font, size: node.kind === 'PILLAR' ? 13 : 12 },
    url: node.url || undefined,
    kind: node.kind,
    desc: cat ? node.label + ' — ' + cat.label : node.label,
  };
}

// ── API ────────────────────────────────────────────────────────────

async function kwFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}/api/knowledge${path}`, {
    headers: authHeaders(),
    ...options,
  });
  if (res.status === 401) {
    handleAuthExpiry();
    throw new Error('Your session expired. Please sign in again.');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Request failed (HTTP ${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

/**
 * Hands any pre-existing localStorage map to the server.
 *
 * The server ignores it once the stored map has real content, so a second
 * device carrying a stale copy cannot overwrite work done elsewhere.
 */
async function migrateLocalGraph() {
  if (localStorage.getItem(KW_MIGRATED_KEY)) return null;

  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(KW_STORAGE_KEY) || 'null'); } catch (_) {}
  if (!stored || !Array.isArray(stored.nodes) || stored.nodes.length === 0) {
    localStorage.setItem(KW_MIGRATED_KEY, '1');
    return null;
  }

  let localCats = [];
  try { localCats = JSON.parse(localStorage.getItem(KW_CAT_KEY) || '[]'); } catch (_) {}

  // The old format kept colours on each node and category ids on a separate
  // list, with numeric vis ids. Flatten it into what the API accepts.
  const catByPillar = new Map();
  const categories = localCats.map(c => {
    if (c.pillarId != null) catByPillar.set(String(c.pillarId), c.id);
    return {
      categoryKey: c.id,
      label: (c.label || '').replace(/^\S+\s/, '') || c.id,
      icon: c.icon || '📌',
      pillarNodeKey: String(c.pillarId),
      colorBg: c.bg, colorBorder: c.border, colorFont: c.font,
      builtIn: false,
    };
  });

  const edgeList = (stored.edges || [])
    .filter(e => e && e.from != null && e.to != null)
    .map(e => ({ from: String(e.from), to: String(e.to) }));

  // A node's category is whichever pillar points at it.
  const parentOf = new Map();
  edgeList.forEach(e => parentOf.set(e.to, e.from));

  const nodeList = stored.nodes.filter(n => n && n.id != null).map(n => {
    const key = String(n.id);
    const rawLabel = n.label || '';
    const iconMatch = rawLabel.match(/^(\S+)\s+(.*)$/);
    const icon  = iconMatch ? iconMatch[1] : null;
    const label = iconMatch ? iconMatch[2] : rawLabel;

    let kind = 'RESOURCE';
    if (n.shape === 'ellipse' || key === '1') kind = 'ROOT';
    else if (catByPillar.has(key) || !parentOf.has(key)) kind = 'PILLAR';

    return {
      nodeKey: key,
      label: label || key,
      icon,
      url: n.url || null,
      categoryKey: catByPillar.get(parentOf.get(key)) || catByPillar.get(key) || null,
      kind,
      notes: n.desc || null,
    };
  });

  try {
    const result = await kwFetch('/import', {
      method: 'POST',
      body: JSON.stringify({ nodes: nodeList, edges: edgeList, categories }),
    });
    localStorage.setItem(KW_MIGRATED_KEY, '1');
    log(result.imported
      ? `Migrated ${nodeList.length} knowledge nodes from this browser to your account.`
      : 'Your account already has a knowledge map; this browser copy was left alone.');
    return result.graph;
  } catch (err) {
    // Leave the flag unset so it is retried next time.
    log('Knowledge migration failed: ' + err.message, true);
    return null;
  }
}

// ── Categories ─────────────────────────────────────────────────────

function renderCategoryPills() {
  const container = document.getElementById('kwCategoryPills');
  if (!container) return;

  const activePill = document.querySelector('.kap-pill.active');
  const activeVal  = activePill
    ? activePill.dataset.value
    : (_categories[0] ? _categories[0].categoryKey : null);

  container.innerHTML = '';
  _categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'kap-pill' + (cat.categoryKey === activeVal ? ' active' : '');
    btn.dataset.value = cat.categoryKey;
    btn.textContent = (cat.icon ? cat.icon + ' ' : '') + cat.label;
    btn.onclick = () => selectKapPill(btn);
    container.appendChild(btn);
  });

  const addBtn = document.createElement('button');
  addBtn.className = 'kap-pill--add';
  addBtn.textContent = '+ New';
  addBtn.onclick = showNewCategoryInput;
  container.appendChild(addBtn);
}

function showNewCategoryInput() {
  const row = document.getElementById('kapNewCatRow');
  if (row) {
    row.style.display = 'flex';
    document.getElementById('kapNewCatInput').focus();
  }
}

function cancelNewCategory() {
  const row = document.getElementById('kapNewCatRow');
  if (row) row.style.display = 'none';
  document.getElementById('kapNewCatInput').value = '';
}

async function confirmNewCategory() {
  const input = document.getElementById('kapNewCatInput');
  const name  = (input.value || '').trim();
  if (!name) { input.focus(); return; }

  try {
    const cat = await kwFetch('/categories', {
      method: 'POST',
      body: JSON.stringify({ label: name, icon: '📌' }),
    });

    _categories.push(cat);
    renderCategoryPills();
    renderPortalCategorySelects();

    // The server created this category's pillar node too — pull the graph back
    // so the new branch appears without a page reload.
    await reloadGraph();

    const newPill = document.querySelector(`.kap-pill[data-value="${cat.categoryKey}"]`);
    if (newPill) selectKapPill(newPill);

    cancelNewCategory();
  } catch (err) {
    alert('Could not add category: ' + err.message);
    input.select();
  }
}

function selectKapPill(btn) {
  document.querySelectorAll('.kap-pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
}

// ── Graph ──────────────────────────────────────────────────────────

/** Paints a GraphView into the vis DataSets, creating the network if needed. */
function applyGraph(graph) {
  _categories = graph.categories || [];
  renderCategoryPills();
  renderPortalCategorySelects();

  const visNodes = (graph.nodes || []).map(toVisNode);
  const visEdges = (graph.edges || []).map(e => ({ from: e.from, to: e.to }));

  if (nodes && edges) {
    nodes.clear(); edges.clear();
    nodes.add(visNodes); edges.add(visEdges);
    return;
  }

  nodes = new vis.DataSet(visNodes);
  edges = new vis.DataSet(visEdges);

  const container = document.getElementById('knowledgeNetwork');
  if (!container) return;

  const options = {
    nodes: {
      shadow: { enabled: true, size: 8, x: 2, y: 2 },
      borderWidth: 2,
      margin: { top: 8, right: 12, bottom: 8, left: 12 },
    },
    edges: {
      width: 1.5,
      smooth: { type: 'cubicBezier', forceDirection: 'none', roundness: 0.4 },
      color: { color: 'rgba(255,255,255,0.15)', highlight: '#6366f1', hover: '#a5b4fc' },
      arrows: { to: { enabled: true, scaleFactor: 0.5 } },
    },
    physics: {
      enabled: true,
      stabilization: { iterations: 120 },
      barnesHut: { springLength: 180, springConstant: 0.04, damping: 0.2 },
    },
    interaction: { hover: true, tooltipDelay: 150, zoomView: true, dragView: true },
  };

  network = new vis.Network(container, { nodes, edges }, options);

  network.on('click', function (params) {
    const deleteBtn = document.getElementById('deleteNodeBtn');
    if (params.nodes.length > 0) {
      _selectedNodeId = params.nodes[0];
      const nodeData = nodes.get(_selectedNodeId);
      if (deleteBtn) deleteBtn.disabled = nodeData.kind === 'ROOT';
      if (nodeData.url) {
        openKwPanel(nodeData);
      } else {
        closeKwPanel();
      }
    } else {
      _selectedNodeId = null;
      if (deleteBtn) deleteBtn.disabled = true;
      closeKwPanel();
    }
  });
}

async function reloadGraph() {
  const graph = await kwFetch('');
  applyGraph(graph);
  return graph;
}

/** Called when the Knowledge tab is first opened. */
async function initKnowledgeWeb() {
  if (network) return;
  try {
    const migrated = await migrateLocalGraph();
    applyGraph(migrated || await kwFetch(''));
  } catch (err) {
    log('Could not load the knowledge map: ' + err.message, true);
    const container = document.getElementById('knowledgeNetwork');
    if (container && !network) {
      container.innerHTML =
        `<p class="qv-placeholder" style="padding:24px;">Could not load your knowledge map.<br>` +
        `${escapeHtml(err.message)}</p>`;
    }
  }
}

/** Loads the category pills without building the graph, for a first paint. */
async function initCategories() {
  if (_categories.length) { renderCategoryPills(); return; }
  try {
    const graph = await kwFetch('');
    _categories = graph.categories || [];
    renderCategoryPills();
    renderPortalCategorySelects();
  } catch (_) {
    // The graph loader will surface the error; pills can wait.
  }
}

/*
 * Hosts that refuse to be framed, so the panel can go straight to its
 * "open externally" state instead of showing Chrome's "refused to connect"
 * for several seconds first.
 *
 * Verified response headers:
 *   algomaster.io    X-Frame-Options: SAMEORIGIN
 *   takeuforward.org Content-Security-Policy: frame-ancestors 'self'
 * The rest are long-standing, well-known cases.
 */
const NO_EMBED_HOSTS = [
  'algomaster.io',
  'takeuforward.org',
  'instagram.com',
  'leetcode.com',
  'github.com',
  'stackoverflow.com',
  'medium.com',
  'linkedin.com',
  'x.com',
  'twitter.com',
  'facebook.com',
  'reddit.com',
  'geeksforgeeks.org',
  'hackerrank.com',
  'codeforces.com',
];

/** True when the host (or a parent domain of it) is known to block framing. */
function blocksEmbedding(hostname) {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  return NO_EMBED_HOSTS.some(blocked => host === blocked || host.endsWith('.' + blocked));
}

/* Convert a regular YouTube watch URL to an embed URL.
   Returns null when the target cannot be framed at all. */
function toEmbedUrl(url) {
  const origin = encodeURIComponent(window.location.origin || 'https://localhost');
  try {
    const u = new URL(url);
    // youtube.com/watch?v=ID
    if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) {
      const id = u.searchParams.get('v');
      return `https://www.youtube.com/embed/${id}?autoplay=0&rel=0&origin=${origin}&enablejsapi=1`;
    }
    // youtu.be/ID
    if (u.hostname === 'youtu.be') {
      const id = u.pathname.slice(1).split('?')[0];
      return `https://www.youtube.com/embed/${id}?autoplay=0&rel=0&origin=${origin}&enablejsapi=1`;
    }
    if (blocksEmbedding(u.hostname)) return null;
  } catch(_) {}
  return url; // articles / other URLs — try directly
}

function openKwPanel(nodeData) {
  const panel   = document.getElementById('kwIframePanel');
  const iframe  = document.getElementById('kwpIframe');
  const loader  = document.getElementById('kwpLoader');
  const blocked = document.getElementById('kwpBlocked');
  const extLink = document.getElementById('kwpExternalLink');
  const blockedLink = document.getElementById('kwpBlockedLink');

  // Update header
  const rawLabel = (nodeData.label || '').replace(/^\S+\s/, '');
  document.getElementById('kwpTitle').textContent = rawLabel;
  document.getElementById('kwpIcon').textContent  = (nodeData.label || '🔗').split(' ')[0];
  extLink.href      = nodeData.url;
  blockedLink.href  = nodeData.url;

  const embedUrl = toEmbedUrl(nodeData.url);

  // Reset state
  iframe.classList.remove('loaded');
  iframe.src  = '';
  loader.style.display  = 'flex';
  blocked.style.display = 'none';
  panel.classList.add('open');

  if (!embedUrl) {
    // Known to block framing — say so rather than letting the browser show a
    // bare "refused to connect".
    loader.style.display  = 'none';
    blocked.style.display = 'flex';
    const note = document.getElementById('kwpBlockedNote');
    if (note) {
      let host = nodeData.url;
      try { host = new URL(nodeData.url).hostname.replace(/^www\./, ''); } catch (_) {}
      note.textContent = `${host} does not allow being embedded in other sites, so it opens in a new tab.`;
    }
    return;
  }

  // For hosts we have not classified, a blocked frame simply never fires
  // `load`. Four seconds is long enough for a slow page and short enough that
  // a blocked one does not sit on Chrome's error for ages.
  let blockTimer = setTimeout(() => {
    if (!iframe.classList.contains('loaded')) {
      loader.style.display  = 'none';
      blocked.style.display = 'flex';
    }
  }, 4000);

  iframe.onload = () => {
    clearTimeout(blockTimer);
    loader.style.display = 'none';
    iframe.classList.add('loaded');
  };
  iframe.setAttribute('data-raw-url', nodeData.url); // save original for PiP
  iframe.src = embedUrl;
}

function closeKwPanel() {
  const panel  = document.getElementById('kwIframePanel');
  const iframe = document.getElementById('kwpIframe');
  panel.classList.remove('open');
  // stop any playing video / loading after transition
  setTimeout(() => { iframe.src = ''; }, 320);
}

// ── Picture-in-Picture ────────────────────────────────────────────────
async function toggleKwPiP() {
  const iframe = document.getElementById('kwpIframe');
  if (!iframe || !iframe.src) {
    alert('No resource is loaded. Click a node with a link first.');
    return;
  }

  // Re-resolve embed URL fresh (picks up origin correctly)
  const rawSrc = iframe.getAttribute('data-raw-url') || iframe.src;
  const src    = toEmbedUrl(rawSrc) || rawSrc;
  const title  = document.getElementById('kwpTitle').textContent;

  // ── Try Document Picture-in-Picture API (Chrome 116+) ──
  if ('documentPictureInPicture' in window) {
    try {
      const pipWin = await documentPictureInPicture.requestWindow({
        width: 560, height: 315,
        disallowReturnToOpener: false,
      });

      const style = pipWin.document.createElement('style');
      style.textContent = `
        * { margin:0; padding:0; box-sizing:border-box; }
        body { background:#000; overflow:hidden; font-family:system-ui,sans-serif; }
        .pip-shell { display:flex; flex-direction:column; height:100vh; }
        .pip-bar {
          display:flex; align-items:center;
          padding:6px 10px; background:rgba(10,12,22,0.95);
          border-bottom:1px solid rgba(255,255,255,0.07);
        }
        .pip-bar span { color:#e2e8f0; font-size:12px; white-space:nowrap;
          overflow:hidden; text-overflow:ellipsis; max-width:220px; }
        iframe { flex:1; width:100%; border:none; }
      `;
      pipWin.document.head.appendChild(style);

      pipWin.document.body.innerHTML = `
        <div class="pip-shell">
          <div class="pip-bar">
            <span>\uD83C\uDFA5 ${escapeHtml(title)}</span>
          </div>
          <iframe src="${src}" frameborder="0" referrerpolicy="origin"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen></iframe>
        </div>`;

      closeKwPanel();
      return;
    } catch (err) {
      console.warn('Document PiP failed, falling back to popup:', err);
    }
  }

  // ── Fallback: small positioned popup ──
  _openKwPopup(src, title);
  closeKwPanel();
}

function _openKwPopup(src, title) {
  const safeTitle = escapeHtml(title);
  const pw = 560, ph = 340;
  const left = Math.max(0, screen.width  - pw - 20);
  const top  = Math.max(0, screen.height - ph - 60);
  const popup = window.open('', 'kwPiP',
    `width=${pw},height=${ph},left=${left},top=${top},` +
    `toolbar=0,menubar=0,location=0,status=0,resizable=1`);
  if (!popup) { alert('Pop-up blocked. Please allow pop-ups for this site.'); return; }
  popup.document.write(`<!DOCTYPE html>
<html><head><title>${safeTitle}</title><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#000;display:flex;flex-direction:column;height:100vh;font-family:system-ui,sans-serif}
  .bar{padding:6px 10px;background:rgba(10,12,22,0.95);border-bottom:1px solid rgba(255,255,255,0.07);
       display:flex;align-items:center;gap:6px;color:#e2e8f0;font-size:12px;}
  iframe{flex:1;width:100%;border:none}
</style></head>
<body>
  <div class="bar">\uD83C\uDFA5 ${safeTitle}</div>
  <iframe src="${src}" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture"
    allowfullscreen></iframe>
</body></html>`);
  popup.document.close();
}

async function deleteSelectedNode() {
  if (_selectedNodeId === null) return;

  const nodeData = nodes.get(_selectedNodeId);
  if (!nodeData) return;

  if (nodeData.kind === 'ROOT') {
    alert('The root node cannot be deleted.');
    return;
  }

  const isPillar = nodeData.kind === 'PILLAR';
  const question = isPillar
    ? `Delete the "${nodeData.label}" branch and everything filed under it?`
    : `Delete "${nodeData.label}" from your knowledge map?`;
  if (!confirm(question)) return;

  const btn = document.getElementById('deleteNodeBtn');
  if (btn) btn.disabled = true;

  try {
    await kwFetch(`/nodes/${encodeURIComponent(_selectedNodeId)}`, { method: 'DELETE' });
    _selectedNodeId = null;
    closeKwPanel();
    // Deleting a branch also removes its category and children, so take the
    // server's version rather than guessing at the local effect.
    await reloadGraph();
  } catch (err) {
    alert('Could not delete: ' + err.message);
    if (btn) btn.disabled = false;
  }
}

async function addKnowledgeNode() {
  const linkEl  = document.getElementById('kwLinkInput');
  const labelEl = document.getElementById('kwLabelInput');
  const link  = linkEl.value.trim();
  const label = labelEl.value.trim();

  if (!label) {
    alert('Please give this node a label.');
    labelEl.focus();
    return;
  }

  const activePill = document.querySelector('.kap-pill.active');
  const categoryKey = activePill
    ? activePill.dataset.value
    : (_categories[0] && _categories[0].categoryKey);

  if (!categoryKey) {
    alert('Open the Knowledge Web tab first so your categories can load.');
    return;
  }

  const btn = document.querySelector('.kap-submit');
  const originalHtml = btn ? btn.innerHTML : null;
  if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }

  try {
    const node = await kwFetch('/nodes', {
      method: 'POST',
      body: JSON.stringify({ label, url: link || null, categoryKey }),
    });

    // Splice the new node in rather than refetching the whole map, so the
    // graph does not visibly re-stabilise on every add.
    if (nodes && edges) {
      nodes.add(toVisNode(node));
      const cat = categoryByKey(node.categoryKey);
      if (cat && cat.pillarNodeKey) {
        edges.add({ from: cat.pillarNodeKey, to: node.nodeKey });
      }
    }

    linkEl.value = '';
    labelEl.value = '';
    labelEl.focus();
  } catch (err) {
    alert('Could not add node: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      if (originalHtml !== null) btn.innerHTML = originalHtml;
    }
  }
}


// ── Learning portals → Knowledge Web ───────────────────────────────
//
// AlgoMaster and takeUforward both refuse to be framed
// (X-Frame-Options: SAMEORIGIN, and CSP frame-ancestors 'self'), so the cards
// deep-link out. What we can do in-app is let a portal be filed straight into
// the user's knowledge map.

/** Fills every portal card's category picker from the loaded categories. */
function renderPortalCategorySelects() {
  const selects = document.querySelectorAll('.portal-cat-select');
  if (!selects.length) return;

  selects.forEach(sel => {
    const previous = sel.value;
    sel.innerHTML = '';

    if (!_categories.length) {
      const opt = document.createElement('option');
      opt.textContent = 'Loading categories…';
      opt.value = '';
      sel.appendChild(opt);
      sel.disabled = true;
      return;
    }

    _categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.categoryKey;
      opt.textContent = (cat.icon ? cat.icon + ' ' : '') + cat.label;
      sel.appendChild(opt);
    });
    sel.disabled = false;
    if (previous && _categories.some(c => c.categoryKey === previous)) {
      sel.value = previous;
    }
  });
}

/** Saves a portal (or one of its sections) as a node on the knowledge map. */
async function savePortalToKnowledge(btn, label, url) {
  const card   = btn.closest('.portal-card');
  const select = card.querySelector('.portal-cat-select');
  const status = card.querySelector('.portal-save-status');

  const show = (msg, ok) => {
    status.textContent = msg;
    status.className = 'portal-save-status ' + (ok ? 'ok' : 'fail');
    status.hidden = false;
  };

  if (!_categories.length) {
    // The categories come from the same endpoint as the map itself.
    await initCategories();
    renderPortalCategorySelects();
  }

  const categoryKey = select.value || (_categories[0] && _categories[0].categoryKey);
  if (!categoryKey) {
    show('Could not load your categories. Open the Knowledge Web tab and try again.', false);
    return;
  }

  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    const node = await kwFetch('/nodes', {
      method: 'POST',
      body: JSON.stringify({ label, url, categoryKey }),
    });

    // Keep an already-built graph in step, so switching tabs shows it without
    // a refetch. If the tab has never been opened there is nothing to update.
    if (nodes && edges) {
      nodes.add(toVisNode(node));
      const cat = categoryByKey(node.categoryKey);
      if (cat && cat.pillarNodeKey) {
        edges.add({ from: cat.pillarNodeKey, to: node.nodeKey });
      }
    }

    const catLabel = (categoryByKey(categoryKey) || {}).label || 'your map';
    show(`Saved "${label}" under ${catLabel}.`, true);
    setTimeout(() => { status.hidden = true; }, 4000);
  } catch (err) {
    show('Could not save: ' + err.message, false);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────

async function init() {
  log('Initializing dashboard...');
  const token = getToken();
  if (!token) return;

  log('Token found. Checking for cached user...');
  const cachedUser = getCachedUser();
  if (cachedUser) {
    log('Rendering cached user: ' + cachedUser.email);
    renderUserProfile(cachedUser);
  }

  try {
    const user = await loadMe();
    if (!user) return;
    
    log('Server profile loaded: ' + user.email);
    sessionStorage.setItem('user', JSON.stringify(user));
    renderUserProfile(user);

    const problems = await loadProblems(user.id);
    log(`Loaded ${problems.length} problems.`);
    renderProblems(problems);

    const analytics = await loadAnalytics(user.id);
    if (analytics) {
      log('Loaded analytics info.');
      renderAnalytics(analytics);
    }

    // Initialize the vis-network graph when the user reaches the Knowledge tab
    // We can do it lazily or immediately since the div exists.
    document.querySelectorAll('.dash-tab').forEach(btn => {
      btn.addEventListener('click', function() {
        if (this.dataset.tab === 'knowledge') {
          // Loads categories and the stored map together; safe to call again.
          initKnowledgeWeb();
        }
      });
    });
    // Populate the category pills up front so the Add Node form is usable
    // the moment the tab is opened.
    initCategories();

    // Load portal usernames if previously saved locally
    const savedLc = localStorage.getItem('dpt_lc_user');
    if (savedLc) el('leetcodeUser').value = savedLc;
    const savedGh = localStorage.getItem('dpt_gh_user');
    if (savedGh) el('githubUser').value = savedGh;

    log('Dashboard loaded successfully.');

  } catch (err) {
    log('Init failed: ' + err.message, true);
    if (!cachedUser) {
      alert('Could not connect to server. Check your connection or if the backend is running.');
    }
  }
}

document.addEventListener('DOMContentLoaded', init);
