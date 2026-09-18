/**
 * Composition root.
 *
 * The only module the page loads. It is the one place that knows every feature
 * exists: it maps the intents the markup declares onto the functions that
 * satisfy them, then boots. Features know nothing about each other and nothing
 * about the `data-action` names — which is what lets any of them be read,
 * moved or replaced on its own.
 *
 * Looking for where something is wired? It is here.
 * Looking for what something does? It is in the feature module.
 */
import { el } from './core/dom.js';
import { log } from './core/log.js';
import { register, startActions } from './core/actions.js';
import { getCachedUser, getToken, signOut } from './core/session.js';
import { isDemoMode, showDemoBanner } from './core/demo.js';

import { switchTab } from './ui/tabs.js';
import { toggleAIChat, toggleAIWide, toggleLeftSidebar } from './ui/layout.js';

import {
  deleteProblem, loadAnalytics, loadMe, loadProblems,
  renderAnalytics, renderProblems, renderUserProfile,
} from './features/overview.js';
import {
  fetchGithubStats, fetchLeetcodeStats, savePortalToKnowledge,
} from './features/portals.js';
import { selectSysTopic } from './features/systemDesign.js';
import { cancelNewCategory, confirmNewCategory, initCategories } from './features/knowledge/categories.js';
import { addKnowledgeNode, deleteSelectedNode, initKnowledgeWeb } from './features/knowledge/map.js';
import { closeKwPanel, toggleKwPiP } from './features/knowledge/panel.js';
import { loadGeminiModels, saveSettings } from './features/settings.js';
import { runGeminiAutoFill, sendGeminiChat } from './features/assistant.js';
import { submitTrackerProblem } from './features/tracker.js';
import {
  connectGoogleDrive, loadFolderDocs, openDriveFolder,
  openSheetExternal, reloadSheetEmbed,
} from './features/workspace.js';
import { openPrepExternal, reloadPrepEmbed } from './features/prep.js';

/* ── what the markup is allowed to ask for ────────────────────────────────── */

register({
  // chrome
  'tab:switch':                (elm) => switchTab(elm.dataset.tab),
  'layout:toggleSidebar':      () => toggleLeftSidebar(),
  'layout:toggleAiWide':       () => toggleAIWide(),
  'session:signOut':           () => signOut(),

  // A button that is really a link. Kept as an action so the markup stays
  // declarative instead of carrying a window.open() expression.
  'link:open':                 (elm) => window.open(elm.dataset.href, '_blank', 'noopener'),

  // overview
  'problem:delete':            (elm, event) => deleteProblem(event, Number(elm.dataset.id)),

  // portals
  'portals:leetcode':          (elm, event) => fetchLeetcodeStats(event),
  'portals:github':            (elm, event) => fetchGithubStats(event),
  'portals:save':              (elm) => savePortalToKnowledge(elm, elm.dataset.label, elm.dataset.url),

  // system design
  'sysdesign:select':          (elm) => selectSysTopic(elm.dataset.topic),

  // knowledge map
  'knowledge:addNode':         () => addKnowledgeNode(),
  'knowledge:deleteNode':      () => deleteSelectedNode(),
  'knowledge:confirmCategory': () => confirmNewCategory(),
  'knowledge:cancelCategory':  () => cancelNewCategory(),
  'knowledge:closePanel':      () => closeKwPanel(),
  'knowledge:togglePiP':       () => toggleKwPiP(),

  // settings
  'settings:save':             () => saveSettings(),
  'settings:loadModels':       () => loadGeminiModels(),

  // assistant
  'assistant:toggle':          () => toggleAIChat(),
  'assistant:send':            () => sendGeminiChat(),
  'assistant:autofill':        () => runGeminiAutoFill(),
  'assistant:prompt':          (elm) => {
    const input = el('geminiChatInput');
    if (input) input.value = elm.dataset.prompt || '';
    toggleAIChat();
    if (input) input.focus();
  },

  // tracker
  'tracker:submit':            () => submitTrackerProblem(),

  // workspace
  'drive:connect':             () => connectGoogleDrive(),
  'drive:loadDocs':            () => loadFolderDocs(),
  'drive:openFolder':          () => openDriveFolder(),
  'sheet:reload':              () => reloadSheetEmbed(),
  'sheet:open':                () => openSheetExternal(),

  // interview kit
  'prep:reload':               () => reloadPrepEmbed(),
  'prep:open':                 () => openPrepExternal(),
});

/* ── boot ─────────────────────────────────────────────────────────────────── */

export async function init() {
  log('Initializing dashboard...');
  if (isDemoMode()) {
    log('Demo mode — sample data, no network calls.');
    showDemoBanner();
  }
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

    // The map is expensive to build, so it waits for its tab. Safe to call
    // again — it no-ops once built.
    document.querySelectorAll('.dash-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.tab === 'knowledge') initKnowledgeWeb();
      });
    });

    // Category pills up front, so the Add Node form is usable the moment the
    // tab opens.
    initCategories();

    const savedLc = localStorage.getItem('dpt_lc_user');
    if (savedLc && el('leetcodeUser')) el('leetcodeUser').value = savedLc;
    const savedGh = localStorage.getItem('dpt_gh_user');
    if (savedGh && el('githubUser')) el('githubUser').value = savedGh;

    log('Dashboard loaded successfully.');
  } catch (err) {
    log('Init failed: ' + err.message, true);
    if (!cachedUser) {
      alert('Could not connect to server. Check your connection or if the backend is running.');
    }
  }
}

startActions();
document.addEventListener('DOMContentLoaded', init);
