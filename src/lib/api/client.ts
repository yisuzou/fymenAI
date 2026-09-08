/**
 * Client-side access token for the optional `APP_TOKEN` gate.
 *
 * `checkAuth` on the server has always validated `Authorization: Bearer`, but
 * nothing on the client ever sent that header — so setting `APP_TOKEN` locked
 * the app's own UI out of `/api/chat`. Every browser-side request now goes
 * through `authHeaders()`.
 *
 * The token lives in `localStorage`, which means JavaScript on this origin can
 * read it, so an XSS on this page could take it. That is a real trade-off,
 * accepted here because the token gates only this single-user app. Moving it to
 * an httpOnly cookie (a small `POST /api/auth` that sets one, with `checkAuth`
 * accepting either) would remove that exposure and is the better long-term
 * shape.
 */

const KEY = 'fymen.appToken';

export function getAppToken(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    return v && v !== '' ? v : null;
  } catch {
    // Private mode, blocked site data, or a non-browser context.
    return null;
  }
}

export function setAppToken(token: string | null): void {
  try {
    if (token === null || token === '') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, token);
  } catch {
    // Nothing to do — the caller will find out on the next 401.
  }
}

export function authHeaders(): Record<string, string> {
  const token = getAppToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** `fetch` with the access token attached. */
export function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), ...authHeaders() },
  });
}
