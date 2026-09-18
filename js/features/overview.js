/**
 * The landing panel: the profile card, the problem list and the stats row.
 *
 * Owns reading the signed-in user and their problems, and rendering all three.
 * It degrades to the cached profile when the server is unreachable, because a
 * dashboard that shows yesterday's data beats one that shows an error.
 */
import { el, escapeHtml, formatDate, getDifficultyClass } from '../core/dom.js';
import { ApiError, apiFetch } from '../core/http.js';
import { log } from '../core/log.js';
import { REAUTH_FLAG, getCachedUser, handleAuthExpiry, showSessionBanner } from '../core/session.js';

export function renderUserProfile(user) {
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

/**
 * How many rows "Recent Problems" shows.
 *
 * The card is called Recent, and there is no pagination behind it — so past a
 * point it is just a long list in a small box that you scroll and never reach
 * the end of. Ten is a screenful. The count on the stat card above already
 * tells you the real total.
 */
export const RECENT_LIMIT = 10;

export function renderProblems(problems) {
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
  list.querySelectorAll('.problem-more').forEach(n => n.remove());

  const shown = problems.slice(0, RECENT_LIMIT);
  shown.forEach(p => {
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
      <button class="problem-delete-btn" title="Delete problem" data-action="problem:delete" data-id="${p.id}">✕</button>
    `;
    if (p.url) {
      item.style.cursor = 'pointer';
      item.title = 'Open on LeetCode';
      item.querySelector('.problem-info').addEventListener('click', () => window.open(p.url, '_blank'));
    }
    list.appendChild(item);
  });

  // Say what is not shown, rather than letting the list just stop.
  const hidden = problems.length - shown.length;
  if (hidden > 0) {
    const more = document.createElement('p');
    more.className = 'problem-more';
    more.textContent = `+ ${hidden} more — showing your ${RECENT_LIMIT} most recent`;
    list.appendChild(more);
  }
}

export async function deleteProblem(event, problemId) {
  event.stopPropagation();
  if (!confirm('Delete this problem from your dashboard?')) return;
  try {
    await apiFetch(`/api/problems/${problemId}`, { method: 'DELETE' });
    await refreshOverview();
  } catch (err) {
    alert('Could not delete problem: ' + err.message);
  }
}

export function renderAnalytics(analytics) {
  if (!analytics) return;
  el('totalProblems').textContent = analytics.totalProblems || 0;
  el('easyCount').textContent     = analytics.easyCount || 0;
  el('mediumCount').textContent   = analytics.mediumCount || 0;
  el('hardCount').textContent     = analytics.hardCount || 0;
  el('profileTotal').textContent  = analytics.totalProblems || 0;
  el('streakCount').textContent   = analytics.streak || 0;
  el('profileStreak').textContent = analytics.streak || 0;
}

export function openAddProblemModal() {
  el('modalOverlay').style.display = 'flex';
  el('addProblemModal').style.animation = 'fadeSlideUp 0.25s ease';
  el('problemTitle').focus();
}

export function closeAddProblemModal() {
  el('modalOverlay').style.display = 'none';
  el('addProblemForm').reset();
}

export async function submitProblem(event) {
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

    await apiFetch('/api/problems', { method: 'POST', body: payload });

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

export async function refreshOverview() {
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

export async function loadMe() {
  log('Fetching profile from /api/users/me...');
  try {
    // handle401: false — this one decides for itself, because falling back to
    // the cached profile is better than a redirect when re-auth already failed.
    const me = await apiFetch('/api/users/me', { handle401: false });
    sessionStorage.removeItem(REAUTH_FLAG); // token works; reset the loop guard
    return me;
  } catch (err) {
    if (err instanceof ApiError && err.isUnauthorized) {
      log('401 from /api/users/me — session expired, re-authenticating', true);
      if (handleAuthExpiry()) return null;
      return getCachedUser();
    }
    if (err instanceof ApiError) {
      log(`API error: ${err.status} ${err.message}`, true);
      return getCachedUser(); // Degrade gracefully instead of looping
    }
    log(`Network or parser error: ${err.message} — using cached profile`, true);
    showSessionBanner('Could not reach the server. Showing your last cached data.');
    return getCachedUser(); // Network failure: still show dashboard with cached data
  }
}

export async function loadProblems(userId) {
  log('Loading problems from /api/problems/user/' + userId + '...');
  try {
    return await apiFetch(`/api/problems/user/${userId}`);
  } catch (err) {
    log(`Failed to load problems: ${err.message}`, true);
    return [];
  }
}

export async function loadAnalytics(userId) {
  log(`Loading analytics from /api/analytics/user/${userId}...`);
  try {
    return await apiFetch(`/api/analytics/user/${userId}`);
  } catch (err) {
    log(`Failed to load analytics: ${err.message}`, true);
    return null;
  }
}

/** Fetch analytics for the currently authenticated user via the /me shortcut. */

export async function loadMyAnalytics() {
  log('Loading analytics from /api/analytics/me...');
  try {
    return await apiFetch('/api/analytics/me');
  } catch (err) {
    log(`Failed to load /me analytics: ${err.message}`, true);
    return null;
  }
}

// ── Code Portals ───────────────────────────────────────────────────

// The original provider (leetcode-stats-api.herokuapp.com) went away with
// Heroku's free tier and had been returning 503 for every request. This mirror
// serves the same JSON shape.

export const refreshProblems = refreshOverview;

// ── Google Drive Folder Browser ────────────────────────────────────────
