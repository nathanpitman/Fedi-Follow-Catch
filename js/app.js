import * as bsky from './bluesky.js';
import * as mastodon from './mastodon.js';
import { computeGaps } from './match.js';
import { renderFollowOnMastodon, renderFollowOnBluesky, renderUnmatched } from './render.js';

const form = document.getElementById('compare-form');
const compareButton = document.getElementById('compare-button');
const statusMessage = document.getElementById('status-message');
const errorMessage = document.getElementById('error-message');
const resultsSection = document.getElementById('results');
const startOverButton = document.getElementById('start-over-button');
const handleInput = document.getElementById('bsky-handle');
const instanceInput = document.getElementById('mastodon-instance');

document.querySelectorAll('.show-toggle').forEach((button) => {
  button.addEventListener('click', () => {
    const target = document.getElementById(button.dataset.target);
    const showing = target.type === 'text';
    target.type = showing ? 'password' : 'text';
    button.textContent = showing ? 'Show' : 'Hide';
  });
});

startOverButton.addEventListener('click', () => {
  // A full reload is the simplest guarantee that nothing — credentials included — lingers in memory.
  window.location.reload();
});

function setStatus(message) {
  statusMessage.textContent = message;
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
}

function clearError() {
  errorMessage.hidden = true;
  errorMessage.textContent = '';
}

function fillColumn(listEl, emptyEl, items, render, ...renderArgs) {
  render(listEl, items, ...renderArgs);
  emptyEl.hidden = items.length > 0;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();
  compareButton.disabled = true;
  resultsSection.hidden = true;

  const blueskyHandle = handleInput.value.trim();
  const blueskyAppPassword = document.getElementById('bsky-app-password').value;
  const mastodonInstanceHost = mastodon.normalizeInstanceHost(instanceInput.value);
  const mastodonToken = document.getElementById('mastodon-token').value;

  try {
    setStatus('Connecting to Bluesky and Mastodon…');
    const [blueskySession, mastodonAccount] = await Promise.all([
      bsky.login(blueskyHandle, blueskyAppPassword),
      mastodon.verifyCredentials(mastodonInstanceHost, mastodonToken),
    ]);

    setStatus('Fetching your Bluesky follows…');
    const blueskyFollows = await bsky.fetchAllFollows(blueskySession, (count) => {
      setStatus(`Fetching your Bluesky follows… (${count} so far)`);
    });

    setStatus('Fetching your Mastodon follows…');
    const mastodonFollowing = await mastodon.fetchAllFollowing(
      mastodonInstanceHost,
      mastodonToken,
      mastodonAccount.id,
      (count) => setStatus(`Fetching your Mastodon follows… (${count} so far)`)
    );

    const { followOnMastodon, followOnBluesky, unmatched } = await computeGaps({
      blueskyFollows,
      mastodonFollowing,
      mastodonInstanceHost,
      onStatus: setStatus,
    });

    document.getElementById('count-mastodon').textContent = `(${followOnMastodon.length})`;
    document.getElementById('count-bluesky').textContent = `(${followOnBluesky.length})`;
    document.getElementById('count-unmatched').textContent = `(${unmatched.length})`;

    fillColumn(
      document.getElementById('list-follow-on-mastodon'),
      document.getElementById('empty-mastodon'),
      followOnMastodon,
      renderFollowOnMastodon,
      mastodonInstanceHost
    );
    fillColumn(
      document.getElementById('list-follow-on-bluesky'),
      document.getElementById('empty-bluesky'),
      followOnBluesky,
      renderFollowOnBluesky
    );
    fillColumn(document.getElementById('list-unmatched'), document.getElementById('empty-unmatched'), unmatched, renderUnmatched);

    setStatus(
      `Done. ${blueskyFollows.length} Bluesky follows, ${mastodonFollowing.length} Mastodon follows compared.`
    );
    resultsSection.hidden = false;
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    setStatus('');
    showError(err?.message || 'Something went wrong. Please try again.');
  } finally {
    compareButton.disabled = false;
  }
});
