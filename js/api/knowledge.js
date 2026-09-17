/**
 * The knowledge-map corner of the backend.
 *
 * Exists so the three knowledge modules and the portals card share one place
 * that knows the /api/knowledge path. It adds nothing else — everything below
 * the path is core/http's job.
 */
import { apiFetch } from '../core/http.js';

export function kwFetch(path, options = {}) {
  return apiFetch(`/api/knowledge${path}`, options);
}

/**
 * Hands any pre-existing localStorage map to the server.
 *
 * The server ignores it once the stored map has real content, so a second
 * device carrying a stale copy cannot overwrite work done elsewhere.
 */
