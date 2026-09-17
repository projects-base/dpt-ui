/**
 * The Interview Kit panel.
 *
 * The study app is a separate single-page app served by the tracker service at
 * /prep. It lives here as a framed panel rather than a link out, so it keeps
 * the dashboard's sidebar and you can leave it again — the same treatment the
 * Sheets embed gets, for the same reason.
 *
 * It loads on first view rather than at boot: it is a full app, and paying for
 * it on every dashboard load to serve a tab most visits never open would be
 * wasteful.
 */
import { API_BASE } from '../core/config.js';
import { el } from '../core/dom.js';
import { EVENTS, on } from '../core/events.js';
import { errorState, loadingState } from '../ui/states.js';

/** Where the study app lives. Same host as the API — it is served by it. */
const PREP_URL = () => `${API_BASE}/prep/`;

let loaded = false;

/**
 * Builds the frame once.
 *
 * @param {boolean} force re-create it even if already built, for Refresh.
 */
export function renderPrepEmbed(force = false) {
  const wrap = el('prepEmbed');
  if (!wrap) return;
  if (loaded && !force) return;

  // The state goes in first and the frame paints over it. A whole app takes
  // a moment to boot, and a blank rectangle in the meantime reads as broken.
  wrap.innerHTML = loadingState('Opening your question bank, plan and explainers…');

  const frame = document.createElement('iframe');
  frame.className = 'prep-embed';
  frame.title = 'Interview Kit';
  frame.referrerPolicy = 'no-referrer';

  // A cross-origin frame will not tell us that the server returned 502 — the
  // load event fires either way. What it will tell us is that it never loaded
  // at all, which is the case worth reporting: the service is not running.
  const failIfSilent = window.setTimeout(() => {
    wrap.innerHTML = errorState({
      title: 'The Interview Kit did not load',
      detail: `Nothing answered at ${PREP_URL()}. If you are running locally, the tracker service needs to be up.`,
      retryAction: 'prep:reload',
    });
    loaded = false;
  }, 12000);

  frame.addEventListener('load', () => window.clearTimeout(failIfSilent));
  frame.src = PREP_URL();
  wrap.appendChild(frame);
  loaded = true;
}

/** Refresh: rebuild the frame rather than reach into its document, which is cross-origin. */
export function reloadPrepEmbed() {
  renderPrepEmbed(true);
}

/** For when the panel is too small — the kit has its own full-screen modes. */
export function openPrepExternal() {
  window.open(PREP_URL(), '_blank', 'noopener');
}

// Built on first view, like the Drive and Sheets panels.
on(EVENTS.TAB_CHANGED, (tabId) => {
  if (tabId === 'prep') renderPrepEmbed();
});
