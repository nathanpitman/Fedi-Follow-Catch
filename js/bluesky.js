// Direct, in-browser AT Protocol calls. Credentials never leave this tab.
const SERVICE = 'https://bsky.social';
const PUBLIC_APPVIEW = 'https://public.api.bsky.app';

export class BlueskyAuthError extends Error {}
export class BlueskyApiError extends Error {}

async function readJsonSafe(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Logs in with a handle + app password via com.atproto.server.createSession.
 * Returns { accessJwt, did, handle }.
 */
export async function login(identifier, appPassword) {
  let res;
  try {
    res = await fetch(`${SERVICE}/xrpc/com.atproto.server.createSession`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password: appPassword }),
    });
  } catch {
    throw new BlueskyAuthError('Could not reach bsky.social. Check your connection and try again.');
  }
  if (!res.ok) {
    const body = await readJsonSafe(res);
    if (res.status === 401) {
      throw new BlueskyAuthError('Bluesky rejected that handle/app password combination.');
    }
    throw new BlueskyAuthError(body?.message || `Bluesky login failed (HTTP ${res.status}).`);
  }
  const data = await res.json();
  return { accessJwt: data.accessJwt, did: data.did, handle: data.handle };
}

/**
 * Fetches the full following list for the logged-in account, paginating via cursor.
 * Calls onProgress(countSoFar) after each page.
 */
export async function fetchAllFollows(session, onProgress) {
  const follows = [];
  let cursor;
  do {
    const url = new URL(`${SERVICE}/xrpc/app.bsky.graph.getFollows`);
    url.searchParams.set('actor', session.did);
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', cursor);

    let res;
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${session.accessJwt}` } });
    } catch {
      throw new BlueskyApiError('Lost connection to bsky.social while fetching your follows.');
    }
    if (res.status === 429) {
      throw new BlueskyApiError('Bluesky rate-limited this request. Wait a minute and try again.');
    }
    if (!res.ok) {
      const body = await readJsonSafe(res);
      throw new BlueskyApiError(body?.message || `Bluesky API error (HTTP ${res.status}) while fetching follows.`);
    }
    const data = await res.json();
    for (const f of data.follows || []) {
      follows.push({
        did: f.did,
        handle: f.handle,
        displayName: f.displayName || '',
        description: f.description || '',
      });
    }
    cursor = data.cursor;
    onProgress?.(follows.length);
  } while (cursor);
  return follows;
}

/**
 * Resolves a Bluesky handle to a DID using the public AppView (no auth required).
 * Returns true if it resolves, false if confirmed not found, or null if unverifiable
 * (network/CORS failure) so callers can degrade gracefully instead of treating it as absent.
 */
export async function handleExists(handle) {
  const url = new URL(`${PUBLIC_APPVIEW}/xrpc/com.atproto.identity.resolveHandle`);
  url.searchParams.set('handle', handle);
  let res;
  try {
    res = await fetch(url);
  } catch {
    return null;
  }
  if (res.status === 400 || res.status === 404) return false;
  if (!res.ok) return null;
  return true;
}
