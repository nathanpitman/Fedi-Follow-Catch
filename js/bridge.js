// Bridgy Fed's handle-mapping convention (confirmed against https://fed.brid.gy/docs):
//   Bluesky handle "alice.bsky.social"   -> fediverse handle "alice.bsky.social@bsky.brid.gy"
//   Fediverse acct "user@instance.tld"   -> Bluesky handle   "user.instance.tld.ap.brid.gy"
// This has changed in the past, so it lives in one place and is verified live (see match.js)
// rather than just trusted blindly.

export function blueskyHandleToBridgedMastodonAcct(handle) {
  return `${handle}@bsky.brid.gy`;
}

export function mastodonAcctToBridgedBlueskyHandle(fullAcct) {
  return `${fullAcct.replace('@', '.')}.ap.brid.gy`;
}
