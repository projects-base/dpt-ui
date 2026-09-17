/**
 * The three things a panel can be showing instead of content.
 *
 * Every panel that fetches something has the same three moments — waiting,
 * nothing to show, and it went wrong — and before this each one invented its
 * own: an hourglass emoji here, a bare sentence there, red text via an inline
 * `style="color:#ef4444"` inside a template string, which no stylesheet could
 * reach and no theme could change.
 *
 * These return markup rather than touching the DOM, because the callers all
 * already own a container and assign to `innerHTML`. Giving them a string
 * keeps this module free of any knowledge of where it is rendered.
 *
 * Adding a fourth state means adding a function here and a modifier in
 * dashboard-ext.css — never a new shape inside a feature.
 */
import { escapeHtml } from '../core/dom.js';

/**
 * Waiting on something.
 * @param {string} message what is being waited for, in the user's terms
 */
export function loadingState(message = 'Loading…') {
  return `
    <div class="panel-state panel-state--loading" role="status" aria-live="polite">
      <div class="panel-state-spinner" aria-hidden="true"></div>
      <p class="panel-state-hint">${escapeHtml(message)}</p>
    </div>`;
}

/**
 * Nothing to show, and that is fine.
 *
 * `hint` should say what to do about it. "No documents yet" leaves the user
 * nowhere; "Submit a problem to auto-create one" is the same fact with an exit.
 */
export function emptyState({ icon = '📭', title, hint = '' } = {}) {
  return `
    <div class="panel-state panel-state--empty">
      <div class="panel-state-icon" aria-hidden="true">${icon}</div>
      <p class="panel-state-title">${escapeHtml(title)}</p>
      ${hint ? `<p class="panel-state-hint">${escapeHtml(hint)}</p>` : ''}
    </div>`;
}

/**
 * It went wrong.
 *
 * `detail` is the server's own message where there is one. Swallowing it to
 * show "Something went wrong" is the reason support tickets have no detail in
 * them, so it is shown.
 *
 * @param {string} [retryAction] a data-action intent; renders a Try again button
 */
export function errorState({ title = 'That did not work', detail = '', retryAction = '' } = {}) {
  return `
    <div class="panel-state panel-state--error" role="alert">
      <div class="panel-state-icon" aria-hidden="true">⚠️</div>
      <p class="panel-state-title">${escapeHtml(title)}</p>
      ${detail ? `<p class="panel-state-hint">${escapeHtml(detail)}</p>` : ''}
      ${retryAction
        ? `<button class="btn btn-ghost btn-sm" data-action="${escapeHtml(retryAction)}">Try again</button>`
        : ''}
    </div>`;
}
