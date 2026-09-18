/**
 * The one way this app talks to its backend.
 *
 * Features depend on this, never on `fetch` directly — so the base URL, the
 * bearer token, the 401 policy and the error shape are decided once. Third
 * party calls (LeetCode, GitHub, Google Drive) deliberately bypass it: they
 * have different auth and are not our API.
 */
import { API_BASE } from './config.js';
import { authHeaders, handleAuthExpiry } from './session.js';
import { demoRespond, isDemoMode } from './demo.js';
import { on } from './events.js';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
  get isUnauthorized() { return this.status === 401; }
}

/**
 * One call to the backend.
 *
 * Every call site used to repeat the same four steps by hand — prefix the base
 * URL, attach auth headers, branch on 401, branch on !ok — and they had drifted:
 * some 401s re-authenticated, some logged and returned an empty array, so an
 * expired token behaved differently depending on which panel you were looking
 * at. This makes that one decision, in one place.
 *
 * @param {string} path      Path beginning with '/', or an absolute URL.
 * @param {object} [options]
 * @param {string} [options.method='GET']
 * @param {*}      [options.body]          Serialised as JSON when present.
 * @param {boolean}[options.handle401=true] Re-authenticate on 401. Pass false
 *   when the caller wants to decide (e.g. fall back to cached data instead).
 * @param {boolean}[options.raw=false]     Resolve the Response, not parsed JSON.
 * @returns {Promise<*>} Parsed JSON, or null for an empty body.
 * @throws {ApiError} On any non-2xx response, carrying the status and the
 *   server's own message when it sent one.
 */
export async function apiFetch(path, options = {}) {
  const { method = 'GET', body, handle401 = true, raw = false, headers } = options;

  // Demo mode answers from fixtures and returns here — before `fetch`, before
  // the token is read. That is the whole safety argument: the service and the
  // database are not merely left unmodified, they are never contacted.
  if (isDemoMode()) return demoRespond(path, method);

  const url = /^https?:\/\//.test(path) ? path : `${API_BASE}${path}`;

  const res = await fetch(url, {
    method,
    headers: { ...authHeaders(), ...(headers || {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (res.status === 401) {
    if (handle401) handleAuthExpiry();
    throw new ApiError(401, 'Your session expired. Please sign in again.');
  }

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const parsed = await res.json();
      if (parsed && parsed.message) message = parsed.message;
    } catch (_) {
      // A non-JSON error body is fine — the status already carries the meaning.
    }
    throw new ApiError(res.status, message);
  }

  if (raw) return res;
  if (res.status === 204) return null;
  return res.json().catch(() => null);
}
