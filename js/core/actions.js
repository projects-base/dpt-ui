/**
 * One delegated listener for every button on the page.
 *
 * The dashboard used to carry ~50 inline `onclick="doThing()"` attributes.
 * Those only work when the handler is a global, which rules out ES modules
 * entirely — and they scatter behaviour across the markup where nothing can
 * find it. Markup now names an intent:
 *
 *     <button data-action="tab:switch" data-tab="overview">
 *
 * and a module registers what that intent does. The two never reference each
 * other by function name.
 *
 * Adding an action means adding a key. The dispatcher below never changes —
 * open for extension, closed for modification, which is the one place in this
 * app where that principle earns its keep.
 */
import { log } from './log.js';

/** @type {Map<string, (el: HTMLElement, event: Event) => void>} */
const registry = new Map();

/**
 * @param {Record<string, (el: HTMLElement, event: Event) => void>} actions
 *   Keyed by the `data-action` value. Namespaced `feature:verb` by convention,
 *   so a grep for the string finds both the markup and the handler.
 */
export function register(actions) {
  for (const [name, handler] of Object.entries(actions)) {
    if (registry.has(name)) {
      // Two modules claiming one name means one of them silently loses.
      log(`Duplicate action "${name}" — the later registration wins.`, true);
    }
    registry.set(name, handler);
  }
}

/**
 * Starts listening. Call once, from the composition root.
 *
 * Delegation is on `document`, so markup rendered later — the problem list, the
 * Drive file list — works with no rebinding. That was the other reason the
 * inline handlers survived so long.
 */
export function startActions(root = document) {
  root.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const name = target.dataset.action;
    const handler = registry.get(name);
    if (!handler) {
      log(`No handler registered for data-action="${name}"`, true);
      return;
    }
    handler(target, event);
  });

  // A few controls are meaningful on change rather than click.
  root.addEventListener('change', (event) => {
    const target = event.target.closest('[data-action-change]');
    if (!target) return;
    const handler = registry.get(target.dataset.actionChange);
    if (handler) handler(target, event);
  });

  // Keyboard intents, declared the same way: data-enter-action on an input
  // replaces an inline onkeydown that tested event.key in the markup.
  root.addEventListener('keydown', (event) => {
    const attr = event.key === 'Enter' ? 'enter-action'
      : event.key === 'Escape' ? 'escape-action'
      : null;
    if (!attr) return;
    const target = event.target.closest(`[data-${attr}]`);
    if (!target) return;
    event.preventDefault();
    dispatch(target.getAttribute(`data-${attr}`), target, event);
  });
}

/**
 * Runs a registered action directly.
 *
 * The keyboard path uses this rather than synthesising a click, so an input
 * that reacts to Enter does not also have to be clickable.
 */
export function dispatch(name, element, event) {
  const handler = registry.get(name);
  if (!handler) {
    log(`No handler registered for action "${name}"`, true);
    return;
  }
  handler(element, event);
}

/** Exposed for the smoke test, which asserts the markup and the registry agree. */
export function registeredActions() {
  return [...registry.keys()];
}
