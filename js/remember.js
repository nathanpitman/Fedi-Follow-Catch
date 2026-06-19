// Optional, opt-in convenience: remembers only the non-secret handle/instance
// fields across visits. Never touches the app password or access token —
// those still live only in page memory, per the trust promise in the README.
const STORAGE_KEY = 'fedi-follow-fetch:remember';
const REMEMBER_DAYS = 30;

export function loadRemembered() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!data.expiresAt || Date.now() > data.expiresAt) {
    forgetRemembered();
    return null;
  }
  return { handle: data.handle || '', instanceHost: data.instanceHost || '' };
}

export function saveRemembered(handle, instanceHost) {
  const expiresAt = Date.now() + REMEMBER_DAYS * 24 * 60 * 60 * 1000;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ handle, instanceHost, expiresAt }));
  } catch {
    // localStorage unavailable (private browsing, disabled storage, etc.) - skip silently.
  }
}

export function forgetRemembered() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
