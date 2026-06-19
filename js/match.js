import { handleExists } from './bluesky.js';
import { webfingerHasAccount } from './mastodon.js';
import { blueskyHandleToBridgedMastodonAcct, mastodonAcctToBridgedBlueskyHandle } from './bridge.js';

// Above this many unmatched accounts on one side, skip the live bridge-existence
// check (one webfinger/resolveHandle call per account) so we don't hammer
// bsky.brid.gy or the public AppView for visitors with very large follow lists.
const MAX_BRIDGE_VERIFICATIONS = 250;
const VERIFY_CONCURRENCY = 4;

function normalizeText(s) {
  return (s || '').trim().toLowerCase();
}

const URL_RE = /https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi;

function extractDomains(text) {
  const domains = new Set();
  let m;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text || ''))) {
    domains.add(m[1].toLowerCase().replace(/^www\./, ''));
  }
  return domains;
}

function hasIntersection(a, b) {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

function mastodonAccountText(m) {
  const fieldText = (m.fields || []).map((f) => `${f.value}`).join(' ');
  return `${m.note || ''} ${fieldText}`;
}

/** Best-effort fallback match when handle-based bridging isn't detected. */
function fuzzyFindMastodonMatch(bskyFollow, candidates) {
  const bName = normalizeText(bskyFollow.displayName);
  const bDomains = extractDomains(bskyFollow.description);
  if (!bName && bDomains.size === 0) return null;
  for (const m of candidates) {
    const mDomains = extractDomains(mastodonAccountText(m));
    if (bDomains.size > 0 && hasIntersection(bDomains, mDomains)) return m;
    const mName = normalizeText(m.displayName);
    if (bName && mName && bName === mName) return m;
  }
  return null;
}

async function throttledForEach(items, concurrency, fn) {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

/**
 * Compares a visitor's Bluesky and Mastodon follow lists and produces:
 *  - followOnMastodon: Bluesky follows with no detected Mastodon-side follow
 *  - followOnBluesky: Mastodon follows with no detected Bluesky-side follow
 *  - unmatched: accounts where no Bridgy Fed bridge could be confirmed on either side
 */
export async function computeGaps({ blueskyFollows, mastodonFollowing, mastodonInstanceHost, onStatus }) {
  const mastodonByAcct = new Map();
  for (const m of mastodonFollowing) {
    m.fullAcct = m.acct.includes('@') ? m.acct : `${m.acct}@${mastodonInstanceHost}`;
    mastodonByAcct.set(m.fullAcct.toLowerCase(), m);
  }

  const matchedMastodonIds = new Set();
  const matchedBlueskyDids = new Set();

  onStatus?.('Matching accounts by Bridgy Fed handle convention…');

  // Pass 1: direct, deterministic match on the bridged handle.
  const blueskyGapCandidates = [];
  for (const b of blueskyFollows) {
    const expectedAcct = blueskyHandleToBridgedMastodonAcct(b.handle).toLowerCase();
    const direct = mastodonByAcct.get(expectedAcct);
    if (direct) {
      matchedMastodonIds.add(direct.id);
      matchedBlueskyDids.add(b.did);
    } else {
      blueskyGapCandidates.push(b);
    }
  }

  // Pass 2: fuzzy fallback on display name + shared bio domain, for accounts
  // that bridged with a differently-shaped handle (e.g. custom domains).
  const blueskyAfterFuzzy = [];
  for (const b of blueskyGapCandidates) {
    const remaining = mastodonFollowing.filter((m) => !matchedMastodonIds.has(m.id));
    const m = fuzzyFindMastodonMatch(b, remaining);
    if (m) {
      matchedMastodonIds.add(m.id);
      matchedBlueskyDids.add(b.did);
    } else {
      blueskyAfterFuzzy.push(b);
    }
  }

  const mastodonGapCandidates = mastodonFollowing.filter((m) => !matchedMastodonIds.has(m.id));

  const followOnMastodon = [];
  const followOnBluesky = [];
  const unmatched = [];

  const totalToVerify = blueskyAfterFuzzy.length + mastodonGapCandidates.length;
  const skipVerification = totalToVerify > MAX_BRIDGE_VERIFICATIONS;

  if (skipVerification) {
    onStatus?.(
      `${totalToVerify} unmatched accounts — skipping live bridge checks for a list this large (bridge status shown as unverified).`
    );
  } else if (totalToVerify > 0) {
    onStatus?.(`Checking bridge status for ${totalToVerify} unmatched accounts…`);
  }

  await throttledForEach(blueskyAfterFuzzy, VERIFY_CONCURRENCY, async (b) => {
    const acct = blueskyHandleToBridgedMastodonAcct(b.handle);
    const exists = skipVerification ? null : await webfingerHasAccount('bsky.brid.gy', acct);
    if (exists === false) {
      unmatched.push({
        source: 'bluesky',
        displayName: b.displayName || b.handle,
        handle: b.handle,
        profileUrl: `https://bsky.app/profile/${b.handle}`,
        reason: 'No Bridgy Fed bridge detected on the fediverse side yet.',
      });
    } else {
      followOnMastodon.push({
        displayName: b.displayName || b.handle,
        handle: b.handle,
        followAcct: acct,
        bridgeVerified: exists === true,
      });
    }
  });

  await throttledForEach(mastodonGapCandidates, VERIFY_CONCURRENCY, async (m) => {
    const bridgedHandle = mastodonAcctToBridgedBlueskyHandle(m.fullAcct);
    const exists = skipVerification ? null : await handleExists(bridgedHandle);
    if (exists === false) {
      unmatched.push({
        source: 'mastodon',
        displayName: m.displayName || m.fullAcct,
        handle: m.fullAcct,
        profileUrl: m.url,
        reason: 'No Bridgy Fed bridge detected on the Bluesky side yet.',
      });
    } else {
      followOnBluesky.push({
        displayName: m.displayName || m.fullAcct,
        handle: bridgedHandle,
        profileUrl: `https://bsky.app/profile/${bridgedHandle}`,
        bridgeVerified: exists === true,
      });
    }
  });

  return { followOnMastodon, followOnBluesky, unmatched };
}
