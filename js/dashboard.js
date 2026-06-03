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

  // Update greeting based on time of day
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  el('welcomeBanner').querySelector('.welcome-title').innerHTML =
    `${greeting}, <span id="welcomeName">${firstName}</span> 👋`;
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
    if (!res.ok) throw new Error('Delete failed');
    const user = getCachedUser();
    if (user) {
      const [problems, analytics] = await Promise.all([
        loadProblems(user.id),
        loadAnalytics(user.id),
      ]);
      renderProblems(problems);
      if (analytics) renderAnalytics(analytics);
    }
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
    .replace(/"/g, '&quot;');
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

  const user = getCachedUser();
  if (!user) return;

  const payload = {
    title:      el('problemTitle').value.trim(),
    url:        el('problemUrl').value.trim() || null,
    difficulty: el('problemDifficulty').value,
    tags:       el('problemTags').value.trim() || null,
    notes:      el('problemNotes').value.trim() || null,
    user:       { id: user.id },
  };

  try {
    const res = await fetch(`${API_BASE}/api/problems`, {
      method:  'POST',
      headers: authHeaders(),
      body:    JSON.stringify(payload),
    });

    if (!res.ok) throw new Error('Failed to add problem');
    closeAddProblemModal();
    await loadProblems(user.id);
  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    btn.textContent = 'Add Problem';
    btn.disabled = false;
  }
}

// ── API calls ─────────────────────────────────────────────────────

async function loadMe() {
  log('Fetching profile from /api/users/me...');
  try {
    const res = await fetch(`${API_BASE}/api/users/me`, { headers: authHeaders() });
    log(`Profile response status: ${res.status}`);

    // If the resource-server rejects the Google ID token (JWT audience/issuer mismatch),
    // fall back to cached user — DO NOT signOut(), that creates an infinite loop.
    if (res.status === 401) {
      log('401 from /api/users/me — using cached profile (token validation mismatch)', true);
      return getCachedUser();
    }
    if (!res.ok) {
      log(`API error: ${res.status} ${res.statusText}`, true);
      return getCachedUser(); // Degrade gracefully instead of looping
    }
    return res.json();
  } catch (err) {
    log(`Network or parser error: ${err.message} — using cached profile`, true);
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

async function fetchLeetcodeStats() {
  const user = el('leetcodeUser').value.trim();
  if (!user) {
    alert('Please enter a LeetCode username');
    return;
  }
  const btn = event.currentTarget;
  btn.textContent = 'Syncing...';
  try {
    const res = await fetch(`https://leetcode-stats-api.herokuapp.com/${user}`);
    const data = await res.json();
    if (data.status === 'success') {
      el('lcSolved').textContent = data.totalSolved || 0;
      el('lcRank').textContent = data.ranking || '—';
      el('leetcodeStats').style.display = 'flex';
      localStorage.setItem('dpt_lc_user', user);
    } else {
      alert('LeetCode user not found or API error.');
    }
  } catch (e) {
    alert('Error fetching LeetCode stats: ' + e.message);
  } finally {
    btn.textContent = 'Sync Stats';
  }
}

async function fetchGithubStats() {
  const user = el('githubUser').value.trim();
  if (!user) {
    alert('Please enter a GitHub username');
    return;
  }
  const btn = event.currentTarget;
  btn.textContent = 'Syncing...';
  try {
    const res = await fetch(`https://api.github.com/users/${user}`);
    if (!res.ok) throw new Error('User not found');
    const data = await res.json();
    el('ghRepos').textContent = data.public_repos || 0;
    el('ghFollowers').textContent = data.followers || 0;
    el('githubStats').style.display = 'flex';
    localStorage.setItem('dpt_gh_user', user);
  } catch (e) {
    alert('Error fetching GitHub stats: ' + e.message);
  } finally {
    btn.textContent = 'Sync Stats';
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

let network = null;
let nodes   = null;
let edges   = null;
let _nodeIdCounter = 10;
let _selectedNodeId = null;
const KW_STORAGE_KEY  = 'dpt_knowledge_web';
const KW_CAT_KEY      = 'dpt_kw_categories';

// ── Category color palette (rotated for custom categories) ──────────
const CAT_PALETTE = [
  { bg: '#1e3a5f', border: '#1d4ed8', font: '#93c5fd' }, // blue
  { bg: '#3b1f5e', border: '#7c3aed', font: '#c4b5fd' }, // purple
  { bg: '#1a3a2a', border: '#059669', font: '#6ee7b7' }, // teal
  { bg: '#3d1f1f', border: '#dc2626', font: '#fca5a5' }, // red
  { bg: '#3a2e10', border: '#d97706', font: '#fcd34d' }, // amber
  { bg: '#1a2a3a', border: '#0891b2', font: '#67e8f9' }, // cyan
  { bg: '#2e1a3a', border: '#db2777', font: '#f9a8d4' }, // pink
  { bg: '#1a3a1a', border: '#16a34a', font: '#86efac' }, // green
];

// Default built-in categories
const DEFAULT_CATS = [
  { id: 'youtube',  label: '🎥 Deep Dive',     icon: '🎥', pillarId: 4, bg: '#4c1d95', border: '#6d28d9', font: '#ddd6fe' },
  { id: 'insta',    label: '⚡ Quick Logic',    icon: '⚡', pillarId: 3, bg: '#022c22', border: '#047857', font: '#a7f3d0' },
  { id: 'article',  label: '📄 Article',        icon: '📄', pillarId: 5, bg: '#3f3f46', border: '#71717a', font: '#d4d4d8' },
  { id: 'system',   label: '🏗️ System Design',  icon: '🏗️', pillarId: 2, bg: '#1e1b4b', border: '#3730a3', font: '#a5b4fc' },
];

let _categories = [];  // will be populated in initCategories()

function saveCategories() {
  // Only save custom (non-default) ones
  const custom = _categories.filter(c => !DEFAULT_CATS.find(d => d.id === c.id));
  try { localStorage.setItem(KW_CAT_KEY, JSON.stringify(custom)); } catch(e) {}
}

function initCategories() {
  _categories = [...DEFAULT_CATS];
  try {
    const raw = localStorage.getItem(KW_CAT_KEY);
    if (raw) {
      const custom = JSON.parse(raw);
      _categories.push(...custom);
    }
  } catch(e) {}
  renderCategoryPills();
}

function renderCategoryPills() {
  const container = document.getElementById('kwCategoryPills');
  if (!container) return;
  const activePill = document.querySelector('.kap-pill.active');
  const activeVal  = activePill ? activePill.dataset.value : (_categories[0]?.id || 'youtube');

  container.innerHTML = '';
  _categories.forEach((cat, i) => {
    const btn = document.createElement('button');
    btn.className = 'kap-pill' + (cat.id === activeVal ? ' active' : '');
    btn.dataset.value = cat.id;
    btn.textContent = cat.label;
    btn.onclick = () => selectKapPill(btn);
    container.appendChild(btn);
  });

  // "+ New" dashed pill at end
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

function confirmNewCategory() {
  const input = document.getElementById('kapNewCatInput');
  const name  = (input.value || '').trim();
  if (!name) { input.focus(); return; }

  // Prevent duplicate
  if (_categories.find(c => c.label.toLowerCase().includes(name.toLowerCase()))) {
    input.select(); return;
  }

  // Pick colors from palette (cycle)
  const palette = CAT_PALETTE[(_categories.length - DEFAULT_CATS.length) % CAT_PALETTE.length];

  // Create a new pillar node on the graph for this category
  const newPillarId = ++_nodeIdCounter;
  const icon = '📌';
  const cat = {
    id:       'custom_' + Date.now(),
    label:    icon + ' ' + name,
    icon,
    pillarId: newPillarId,
    bg:       palette.bg,
    border:   palette.border,
    font:     palette.font,
  };

  _categories.push(cat);

  // Add pillar node if graph is initialized
  if (nodes) {
    nodes.add({
      id:    newPillarId,
      label: icon + ' ' + name,
      shape: 'box',
      color: { background: palette.bg, border: palette.border },
      font:  { color: palette.font, size: 13 },
    });
    edges.add({ from: 1, to: newPillarId });
    saveKnowledgeGraph();
  }

  saveCategories();
  renderCategoryPills();

  // Auto-select the new pill
  setTimeout(() => {
    const newPill = document.querySelector(`.kap-pill[data-value="${cat.id}"]`);
    if (newPill) selectKapPill(newPill);
  }, 0);

  cancelNewCategory();
}

function saveKnowledgeGraph() {
  try {
    const data = {
      nodes: nodes.get(),
      edges: edges.get(),
      counter: _nodeIdCounter
    };
    localStorage.setItem(KW_STORAGE_KEY, JSON.stringify(data));
  } catch(e) { console.warn('Could not save knowledge graph:', e); }
}

function loadSavedGraph() {
  try {
    const raw = localStorage.getItem(KW_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch(e) { return null; }
}

function initKnowledgeWeb() {
  if (network) return; // already initialized

  const seedNodes = [
    // Root
    { id: 1, label: '\uD83E\uDDE0 My Brain', shape: 'ellipse', size: 28,
      color: { background: '#6366f1', border: '#4f46e5', highlight: { background: '#7c3aed', border: '#6d28d9' } },
      font: { color: 'white', size: 14, bold: true } },
    // Pillars
    { id: 2, label: '\uD83C\uDFD7 System Design', shape: 'box',
      color: { background: '#312e81', border: '#4338ca' }, font: { color: '#c7d2fe', size: 13 } },
    { id: 3, label: '\uD83D\uDCCA Algorithms', shape: 'box',
      color: { background: '#064e3b', border: '#047857' }, font: { color: '#a7f3d0', size: 13 } },
    { id: 4, label: '\uD83D\uDCFA Deep Dives', shape: 'box',
      color: { background: '#4c1d95', border: '#6d28d9' }, font: { color: '#ddd6fe', size: 13 } },
    { id: 5, label: '\uD83D\uDCC4 Articles', shape: 'box',
      color: { background: '#3f3f46', border: '#71717a' }, font: { color: '#d4d4d8', size: 13 } },
    // Sample leaves
    { id: 6, label: '\u26A1 Load Balancing', shape: 'box', size: 14,
      color: { background: '#1e1b4b', border: '#3730a3' }, font: { color: '#a5b4fc', size: 12 } },
    { id: 7, label: '\uD83D\uDDC4 CAP Theorem', shape: 'box', size: 14,
      color: { background: '#1e1b4b', border: '#3730a3' }, font: { color: '#a5b4fc', size: 12 } },
  ];

  const seedEdges = [
    { from: 1, to: 2 }, { from: 1, to: 3 }, { from: 1, to: 4 }, { from: 1, to: 5 },
    { from: 2, to: 6 }, { from: 2, to: 7 }
  ];

  // ── Restore from localStorage, or fall back to seed data ──
  const saved = loadSavedGraph();
  const initialNodes = saved ? saved.nodes : seedNodes;
  const initialEdges = saved ? saved.edges : seedEdges;
  if (saved) _nodeIdCounter = saved.counter || 10;

  nodes = new vis.DataSet(initialNodes);
  edges = new vis.DataSet(initialEdges);

  const container = document.getElementById('knowledgeNetwork');
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
      arrows: { to: { enabled: true, scaleFactor: 0.5 } }
    },
    physics: {
      enabled: true,
      stabilization: { iterations: 120 },
      barnesHut: { springLength: 180, springConstant: 0.04, damping: 0.2 }
    },
    interaction: { hover: true, tooltipDelay: 150, zoomView: true, dragView: true }
  };

  network = new vis.Network(container, { nodes, edges }, options);

  network.on('click', function(params) {
    const deleteBtn = document.getElementById('deleteNodeBtn');
    if (params.nodes.length > 0) {
      _selectedNodeId = params.nodes[0];
      const nodeData = nodes.get(_selectedNodeId);
      if (deleteBtn) deleteBtn.disabled = false;
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

/* Convert a regular YouTube watch URL to an embed URL */
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
    // Instagram — blocks iframes
    if (u.hostname.includes('instagram.com')) return null;
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
    // Site known to block iframes (Instagram etc)
    loader.style.display  = 'none';
    blocked.style.display = 'flex';
    return;
  }

  // timeout to detect blocked iframes (no load event fires)
  let blockTimer = setTimeout(() => {
    if (!iframe.classList.contains('loaded')) {
      loader.style.display  = 'none';
      blocked.style.display = 'flex';
    }
  }, 8000);

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
            <span>\uD83C\uDFA5 ${title}</span>
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
  const pw = 560, ph = 340;
  const left = Math.max(0, screen.width  - pw - 20);
  const top  = Math.max(0, screen.height - ph - 60);
  const popup = window.open('', 'kwPiP',
    `width=${pw},height=${ph},left=${left},top=${top},` +
    `toolbar=0,menubar=0,location=0,status=0,resizable=1`);
  if (!popup) { alert('Pop-up blocked. Please allow pop-ups for this site.'); return; }
  popup.document.write(`<!DOCTYPE html>
<html><head><title>${title}</title><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#000;display:flex;flex-direction:column;height:100vh;font-family:system-ui,sans-serif}
  .bar{padding:6px 10px;background:rgba(10,12,22,0.95);border-bottom:1px solid rgba(255,255,255,0.07);
       display:flex;align-items:center;gap:6px;color:#e2e8f0;font-size:12px;}
  iframe{flex:1;width:100%;border:none}
</style></head>
<body>
  <div class="bar">\uD83C\uDFA5 ${title}</div>
  <iframe src="${src}" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture"
    allowfullscreen></iframe>
</body></html>`);
  popup.document.close();
}

function selectKapPill(btn) {
  document.querySelectorAll('.kap-pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
}

function deleteSelectedNode() {
  if (_selectedNodeId === null) return;
  if (_selectedNodeId === 1) {
    alert('Cannot delete the root node \uD83E\uDDE0 My Brain.');
    return;
  }
  const connectedEdges = network.getConnectedEdges(_selectedNodeId);
  edges.remove(connectedEdges);
  nodes.remove(_selectedNodeId);
  _selectedNodeId = null;
  document.getElementById('deleteNodeBtn').disabled = true;
  // close iframe drawer if it was open
  closeKwPanel();
  saveKnowledgeGraph(); // persist after delete
}

function addKnowledgeNode() {
  if (!network) {
    alert('Please open the Knowledge Web tab first to initialize the graph.');
    return;
  }
  const link = document.getElementById('kwLinkInput').value.trim();
  const label = document.getElementById('kwLabelInput').value.trim();
  // read from pill buttons instead of select
  const activePill = document.querySelector('.kap-pill.active');
  const cat = activePill ? activePill.dataset.value : 'system';

  if (!link || !label) {
    alert('Please provide both a link and a label.');
    return;
  }

  // Look up category from dynamic registry
  const catDef = _categories.find(c => c.id === cat) || _categories[0];
  const icon = catDef.icon || '📌';
  const newId = ++_nodeIdCounter;

  nodes.add({
    id: newId,
    label: icon + ' ' + label,
    shape: 'box',
    color: { background: catDef.bg, border: catDef.border },
    font: { color: catDef.font, size: 12 },
    url: link,
    desc: label + ' — ' + catDef.label
  });
  edges.add({ from: catDef.pillarId, to: newId });

  document.getElementById('kwLinkInput').value = '';
  document.getElementById('kwLabelInput').value = '';
  saveKnowledgeGraph(); // persist after add
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
          initCategories();          // render pills first
          setTimeout(initKnowledgeWeb, 100);
        }
      });
    });
    // Also render pills immediately in case tab is already active
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
