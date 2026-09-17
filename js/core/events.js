/**
 * A very small publish/subscribe bus.
 *
 * It exists to remove circular imports, not for its own sake. Three pairs of
 * modules used to call each other directly:
 *
 *   knowledge/categories ⇄ portals   (portals shows a category picker)
 *   knowledge/categories ⇄ knowledge/map (adding a category reloads the graph)
 *   ui/tabs              ⇄ workspace (opening a tab loads its contents)
 *
 * Each pair had a genuine downward dependency plus one call back upwards. The
 * upward call is now an announcement: the publisher says what happened and does
 * not know or care who listens. That is the dependency-inversion rule applied
 * to the one place here that actually needed it — everywhere else a plain
 * import is clearer and stays a plain import.
 *
 * Deliberately not an EventTarget: a plain map keeps the event names greppable,
 * which matters more than the extra API surface.
 */

/** @type {Map<string, Set<Function>>} */
const listeners = new Map();

/** Known event names, so a typo is a lookup failure rather than silence. */
export const EVENTS = {
  /** The category list changed. Anything showing categories should re-render. */
  CATEGORIES_CHANGED: 'categories:changed',
  /** The stored graph changed server-side and should be pulled again. */
  GRAPH_RELOAD: 'graph:reload',
  /** A dashboard tab became visible. Payload: the tab id. */
  TAB_CHANGED: 'tab:changed',
};

/**
 * @param {string} event
 * @param {Function} handler
 * @returns {() => void} unsubscribe
 */
export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  return () => listeners.get(event)?.delete(handler);
}

/**
 * Announce that something happened. Never throws: one broken listener must not
 * take down the action that triggered it.
 */
export function emit(event, payload) {
  const set = listeners.get(event);
  if (!set) return;
  for (const handler of set) {
    try {
      handler(payload);
    } catch (err) {
      console.error(`[events] listener for "${event}" failed:`, err);
    }
  }
}
