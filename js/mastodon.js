// Direct, in-browser Mastodon REST API calls. Credentials never leave this tab.
export class MastodonAuthError extends Error {}
export class MastodonApiError extends Error {}
export class MastodonRateLimitError extends Error {
  constructor(message, resetAt) {
    super(message);
    this.resetAt = resetAt;
  }
}

/** Strips protocol/path/whitespace from a pasted instance domain so "https://mastodon.social/" -> "mastodon.social". */
export function normalizeInstanceHost(input) {
  return (input || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
}

function apiBase(instanceHost) {
  return `https://${instanceHost}/api/v1`;
}

async function mastodonFetch(url, token) {
  let res;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    const host = new URL(url).host;
    throw new MastodonApiError(
      `Could not reach ${host}. Double-check the instance domain, or this instance may block direct browser access.`
    );
  }
  if (res.status === 429) {
    const reset = res.headers.get('X-RateLimit-Reset');
    const when = reset ? new Date(reset).toLocaleTimeString() : 'in a few minutes';
    throw new MastodonRateLimitError(`Your instance rate-limited this request. Try again ${when}.`, reset);
  }
  if (res.status === 401 || res.status === 403) {
    throw new MastodonAuthError(
      `Your Mastodon token was rejected (HTTP ${res.status}). Check the token and that it has read:accounts and read:follows scopes.`
    );
  }
  if (!res.ok) {
    throw new MastodonApiError(`Mastodon API error (HTTP ${res.status}) from ${new URL(url).host}.`);
  }
  return res;
}

/** Resolves the logged-in account's own id/acct via verify_credentials. */
export async function verifyCredentials(instanceHost, token) {
  const res = await mastodonFetch(`${apiBase(instanceHost)}/accounts/verify_credentials`, token);
  const data = await res.json();
  return { id: data.id, acct: data.acct, username: data.username };
}

function parseNextLink(linkHeader) {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(',')) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

/**
 * Fetches the full following list for accountId, paginating via the Link header.
 * Calls onProgress(countSoFar) after each page.
 */
export async function fetchAllFollowing(instanceHost, token, accountId, onProgress) {
  const following = [];
  let url = `${apiBase(instanceHost)}/accounts/${encodeURIComponent(accountId)}/following?limit=80`;
  while (url) {
    const res = await mastodonFetch(url, token);
    const data = await res.json();
    for (const a of data) {
      following.push({
        id: a.id,
        acct: a.acct,
        displayName: a.display_name || a.username,
        url: a.url,
        note: a.note || '',
        fields: a.fields || [],
      });
    }
    url = parseNextLink(res.headers.get('Link'));
    onProgress?.(following.length);
  }
  return following;
}

/**
 * Checks via WebFinger whether acct@host exists. Returns true/false, or null if
 * unverifiable (network/CORS failure) so callers can degrade gracefully.
 */
export async function webfingerHasAccount(host, acct) {
  const url = `https://${host}/.well-known/webfinger?resource=${encodeURIComponent(`acct:${acct}`)}`;
  try {
    const res = await fetch(url);
    if (res.status === 404) return false;
    if (!res.ok) return null;
    return true;
  } catch {
    return null;
  }
}
