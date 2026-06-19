function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) node.appendChild(child);
  return node;
}

function sortByName(items) {
  return [...items].sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));
}

function gapRow(item, followHref, followLabel) {
  const checkbox = el('input', { type: 'checkbox', class: 'done-checkbox' });
  const li = el('li', { class: 'row' });

  checkbox.addEventListener('change', () => {
    li.classList.toggle('done', checkbox.checked);
  });

  const label = el('label', { class: 'row-main' }, [
    checkbox,
    el('span', { class: 'row-text' }, [
      el('span', { class: 'display-name', text: item.displayName }),
      el('span', { class: 'handle', text: `@${item.handle}` }),
    ]),
  ]);

  const link = el('a', {
    class: 'follow-link',
    href: followHref,
    target: '_blank',
    rel: 'noopener noreferrer',
    text: followLabel,
  });

  li.appendChild(label);
  li.appendChild(link);

  if (item.bridgeVerified === false) {
    li.appendChild(el('span', { class: 'badge badge-unverified', text: 'bridge unverified' }));
  }

  return li;
}

export function renderFollowOnMastodon(listEl, items, mastodonInstanceHost) {
  listEl.replaceChildren();
  for (const item of sortByName(items)) {
    const href = `https://${mastodonInstanceHost}/authorize_interaction?uri=${encodeURIComponent(item.followAcct)}`;
    listEl.appendChild(gapRow(item, href, 'Follow ↗'));
  }
}

export function renderFollowOnBluesky(listEl, items) {
  listEl.replaceChildren();
  for (const item of sortByName(items)) {
    listEl.appendChild(gapRow(item, item.profileUrl, 'Follow ↗'));
  }
}

export function renderUnmatched(listEl, items) {
  listEl.replaceChildren();
  for (const item of sortByName(items)) {
    const li = el('li', { class: 'row row-unmatched' }, [
      el('span', { class: 'row-text' }, [
        el('span', { class: 'display-name', text: item.displayName }),
        el('span', { class: 'handle', text: `@${item.handle}` }),
        el('span', { class: 'source-tag', text: item.source === 'bluesky' ? 'from Bluesky' : 'from Mastodon' }),
        el('span', { class: 'reason', text: item.reason }),
      ]),
    ]);
    if (item.profileUrl) {
      li.appendChild(
        el('a', {
          class: 'follow-link follow-link-muted',
          href: item.profileUrl,
          target: '_blank',
          rel: 'noopener noreferrer',
          text: 'View profile ↗',
        })
      );
    }
    listEl.appendChild(li);
  }
}
