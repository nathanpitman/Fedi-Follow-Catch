# Fedi Follow Fetch

A free, static, client-side-only tool that compares your Bluesky and Mastodon
follow lists — bridged via [Bridgy Fed](https://fed.brid.gy/) — and shows you
who you follow on one network but not the other, with a direct follow link
for each gap.

[Live tool](https://nathanpitman.github.io/fedi-follow-fetch/) · a small
[nathanpitman.com](https://nathanpitman.com) utility.

## Why

Bridgy Fed bridges identity and posts between Bluesky and the fediverse, but
it doesn't reconcile your existing follow lists. If you migrated between the
two networks and bridged your account, you likely follow different, only
partially-overlapping sets of people on each side. This tool is the "diff"
layer on top: read-only, advisory, and entirely manual to act on.

## Privacy and architecture — the important part

This is a **100% static page with no backend**. There is no server, no
database, and no API route belonging to this project. Concretely:

- Your Bluesky app password and Mastodon access token are held only in this
  browser tab's JavaScript memory. They are never written to `localStorage`,
  a cookie, or sent anywhere except directly to `bsky.social` and the exact
  Mastodon instance domain you type in.
- Refreshing or closing the tab erases your password and token — there's
  nothing to log out of. Optionally, ticking "remember my handle & instance"
  saves just those two non-secret fields (never your password or token) to
  `localStorage` for 30 days, purely so a returning visitor doesn't have to
  retype them; leaving it unticked (or letting the 30 days lapse) means
  nothing persists at all, as before.
- The only third-party API calls this page ever makes are to: `bsky.social`,
  `public.api.bsky.app` (Bluesky's public, unauthenticated AppView, used only
  to check whether a bridge handle exists), `bsky.brid.gy` (Bridgy Fed's
  WebFinger endpoint, same purpose), and whatever Mastodon instance domain
  you enter. No analytics, no third-party scripts, no CDNs.
- The tool is strictly read-only against both APIs — it never follows,
  unfollows, or posts. Closing follow gaps is always a manual click-through.

Everything above is verifiable by reading the source — see `js/*.js`, which
has no build step and no minification to obscure what it's doing.

## How it works

1. You enter your Bluesky handle + an [app password](https://bsky.app/settings/app-passwords)
   (not your main password — revocable any time), and your Mastodon instance
   domain + a personal access token generated from your own instance's
   **Preferences → Development** page (scopes: `read:accounts`,
   `read:follows`).
2. The page logs in to Bluesky (`com.atproto.server.createSession`) and
   verifies the Mastodon token (`/api/v1/accounts/verify_credentials`),
   directly from your browser.
3. It fetches your full following list from both networks, paginating via
   Bluesky's `cursor` and Mastodon's `Link` header.
4. It matches accounts across networks:
   - **Direct match** on Bridgy Fed's handle convention (see below).
   - **Fuzzy fallback** on shared display name or a shared domain found in
     both accounts' bio/profile fields, for people who bridged under a
     differently-shaped handle (e.g. a custom domain).
   - Anything still unmatched gets a **live bridge-existence check**
     (WebFinger on the Mastodon side, `resolveHandle` on the Bluesky side)
     so the tool can tell "definitely not bridged yet" apart from "bridged,
     just not followed" — the former goes into a separate "unmatched /
     unbridged" list instead of getting a follow link that wouldn't work.
     (Skipped only if the combined total of unmatched accounts on both sides
     exceeds 2,000, to avoid making thousands of live checks against Bridgy
     Fed/Bluesky's public AppView in one page load for visitors with
     exceptionally large follow lists — in that case every still-unmatched
     account is listed as unmatched for manual checking, rather than handed
     a follow link that might not work yet.)
5. Renders two columns — **Follow on Mastodon** and **Follow on Bluesky** —
   each with a one-click follow link, plus the de-emphasised unmatched
   section. "Mark as done" is a session-only checkbox/strikethrough; nothing
   persists across a refresh.

## Design decisions and findings (resolved before building)

These were the open questions in the brief, and what was confirmed against
live documentation/source before writing any matching logic:

- **Bridgy Fed handle convention** (confirmed against
  [fed.brid.gy/docs](https://fed.brid.gy/docs)): a Bluesky handle
  `alice.bsky.social` bridges into the fediverse as
  `@alice.bsky.social@bsky.brid.gy`. A fediverse account `user@instance.tld`
  bridges into Bluesky as the handle `user.instance.tld.ap.brid.gy`. Bridging
  is opt-in per account (you have to follow the relevant bridge bot once),
  which is why the live verification step exists rather than assuming every
  account is bridged. This convention has shifted before, so it's isolated
  in one file (`js/bridge.js`) rather than scattered across the codebase.
- **CORS**: the primary technical risk called out in the brief. Mastodon's
  own [`config/initializers/cors.rb`](https://github.com/mastodon/mastodon/blob/main/config/initializers/cors.rb)
  grants `Access-Control-Allow-Origin: *` on all `/api/*` routes by default
  — this is core software behaviour, not an instance-specific opt-in, and
  it's the same mechanism that lets existing browser-only Mastodon clients
  (Elk, Phanpy, the old Pinafore) work without a backend. Bluesky's XRPC API
  is the same pattern the official `bsky.app` web client itself relies on.
  Heavily customised or very old instances are a known residual risk; the
  app surfaces a clear "this instance may not support direct browser access"
  error rather than failing silently, instead of introducing a proxy backend.
- **Bluesky pagination**: `app.bsky.graph.getFollows` takes `cursor` +
  `limit` (max 100, default 50); response omits `cursor` on the last page.
- **Mastodon pagination & rate limits**: `/api/v1/accounts/:id/following`
  paginates via the `Link` response header (`rel="next"`); limit caps at 80.
  Rate limits are ~300 requests/5min per account and per IP, communicated via
  `X-RateLimit-*` headers and a `429` status, which the app surfaces as an
  inline error rather than retrying silently.
- **Remote follow link**: Mastodon's generic `/authorize_interaction?uri=`
  endpoint (WebFinger-advertised, core software) lets a visitor follow an
  arbitrary `user@domain` from their own instance without this tool needing
  to know each instance's UI — used for every "Follow on Mastodon" link.

## Known limitations (v1)

- Only resolves the Bluesky session against `bsky.social`; self-hosted PDS
  users outside the main entryway aren't specifically tested for.
- The fuzzy-match fallback is a heuristic (display name + shared bio domain)
  and can occasionally miss or mismatch; the unmatched list exists so you can
  always eyeball the remainder by hand.
- No export/JSON output — this is a one-time visual diff tool, not a
  scripting target, for v1.

## Running locally

No build step. Any static file server works, e.g.:

```sh
python3 -m http.server 8080
# then open http://localhost:8080
```

## Deploying

This repo is set up for GitHub Pages with zero build step: in the repo's
**Settings → Pages**, set source to "Deploy from a branch", branch `main`,
folder `/ (root)`. Add a custom domain/`CNAME` there if you want this on a
nathanpitman.com subdomain instead of the default `github.io` URL.

## License

MIT — see [LICENSE](LICENSE).
