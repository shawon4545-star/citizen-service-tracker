/* Google Drive sync: keeps this browser's data backed up to (and pulled from) a single JSON file
   in the signed-in user's Drive, using the "drive.file" scope (the app can only see files it creates).
   Device-local connection config (client ID, file id, last-synced marker) lives outside DB.KEYS so a
   restore/pull never overwrites it.

   Token lifecycle: Google Identity Services only ever hands back a token into JS memory, which this app
   being a multi-page site (not a single-page app) would normally wipe on every click to another page —
   not just a manual refresh. To make it feel "stays connected" for a normal work session, the token is
   also cached in sessionStorage (survives page-to-page navigation in this tab, cleared when the tab
   closes or the token's own ~55min lifetime runs out). A *silent* renewal (prompt: '') beyond that is
   not guaranteed to succeed (browser session state, third-party cookie blocking, etc), so a silent
   failure is not treated as an error: it's the distinct 'auth_required' state, resolved by one user
   click (Reconnect / Sync Now), which carries the user gesture Google needs to hand back a token
   without a popup being blocked. */

const DriveSync = (() => {
  const CONFIG_KEY = 'cst_drive_config';
  const TOKEN_KEY = 'cst_drive_token';
  const FILE_NAME = 'citizen-service-tracker-backup.json';
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const DEBOUNCE_MS = 4000;

  let tokenClient = null;
  let accessToken = null;
  let tokenExpiresAt = 0;
  let isApplyingRemote = false;
  let pushTimer = null;
  let listeners = [];
  // idle | disconnected | connecting | synced | syncing | conflict | auth_required | error
  let state = { status: 'idle', message: '' };

  function loadCachedToken() {
    try {
      const cached = JSON.parse(sessionStorage.getItem(TOKEN_KEY));
      if (cached && cached.expiresAt > Date.now()) {
        accessToken = cached.token;
        tokenExpiresAt = cached.expiresAt;
      }
    } catch (e) {
      // ignore — worst case we just request a fresh token
    }
  }

  function persistToken() {
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token: accessToken, expiresAt: tokenExpiresAt }));
  }

  function clearCachedToken() {
    sessionStorage.removeItem(TOKEN_KEY);
  }

  function getConfig() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function setConfig(patch) {
    const next = { ...getConfig(), ...patch };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
    return next;
  }

  function setState(status, message = '') {
    state = { status, message };
    listeners.forEach((fn) => fn(state));
  }

  function onChange(fn) {
    listeners.push(fn);
    fn(state);
  }

  function getState() {
    return state;
  }

  function loadGis() {
    return new Promise((resolve, reject) => {
      if (window.google && window.google.accounts && window.google.accounts.oauth2) return resolve();
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Could not load Google Sign-In — check your internet connection.'));
      document.head.appendChild(s);
    });
  }

  function ensureTokenClient(clientId) {
    if (tokenClient && tokenClient.__clientId === clientId) return;
    tokenClient = google.accounts.oauth2.initTokenClient({ client_id: clientId, scope: SCOPE, callback: () => {} });
    tokenClient.__clientId = clientId;
  }

  function requestToken(silent) {
    return new Promise((resolve, reject) => {
      tokenClient.callback = (resp) => {
        if (resp.error) return reject(new Error(resp.error));
        accessToken = resp.access_token;
        tokenExpiresAt = Date.now() + (resp.expires_in - 60) * 1000;
        persistToken();
        resolve(accessToken);
      };
      tokenClient.error_callback = (err) => reject(new Error(err.type || 'auth_failed'));
      tokenClient.requestAccessToken({ prompt: silent ? '' : 'consent' });
    });
  }

  /** Throws an Error with message 'auth_required' when a *silent* renewal fails — callers branch on that
      to show "Reconnect" instead of a scary generic error. */
  async function ensureAccessToken(silent) {
    if (accessToken && Date.now() < tokenExpiresAt) return accessToken;
    const { clientId } = getConfig();
    if (!clientId) throw new Error('No Google Client ID configured.');
    await loadGis();
    ensureTokenClient(clientId);
    try {
      return await requestToken(silent);
    } catch (e) {
      throw new Error(silent ? 'auth_required' : e.message);
    }
  }

  /** Single token attempt for anything triggered directly by a click (Reconnect / Sync Now / conflict
      buttons). Deliberately does NOT try silent first and fall back — chaining two attempts burns through
      the click's "real user gesture" window, so by the second attempt Chrome refuses to open the popup
      (observed as error type "popup_failed_to_open"). Uses prompt:'' so a user who already granted consent
      isn't forced through the full consent screen again, but it only ever asks once. */
  async function requestTokenFromClick() {
    if (accessToken && Date.now() < tokenExpiresAt) return accessToken;
    const { clientId } = getConfig();
    if (!clientId) throw new Error('No Google Client ID configured.');
    await loadGis();
    ensureTokenClient(clientId);
    return requestToken(true);
  }

  async function driveFetch(url, options = {}) {
    // Silent-only: background sync must never pop a consent window with no user gesture behind it.
    const token = await ensureAccessToken(true);
    const res = await fetch(url, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Drive API error (${res.status}): ${body.slice(0, 200)}`);
    }
    return res;
  }

  async function findRemoteFile() {
    const { fileId } = getConfig();
    if (fileId) {
      try {
        const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,modifiedTime&supportsAllDrives=true`);
        return res.json();
      } catch (e) {
        if (e.message === 'auth_required') throw e;
        // fileId went stale (deleted, or from a wiped local config) — fall through to search by name.
      }
    }
    const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
    const res = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,modifiedTime)&spaces=drive`);
    const { files } = await res.json();
    return files && files[0] ? files[0] : null;
  }

  async function createRemoteFile(content) {
    const boundary = 'cst-boundary-' + Math.random().toString(36).slice(2);
    const metadata = JSON.stringify({ name: FILE_NAME, mimeType: 'application/json' });
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n` +
      `--${boundary}--`;
    const res = await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime', {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    return res.json();
  }

  async function updateRemoteFile(fileId, content) {
    const res = await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&fields=id,modifiedTime`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: content,
    });
    return res.json();
  }

  async function getRemoteContent(fileId) {
    const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
    return res.json();
  }

  function applyRemoteDump(dump) {
    isApplyingRemote = true;
    try {
      DB.importAllJSON(dump);
    } finally {
      isApplyingRemote = false;
    }
  }

  async function pull(fileId) {
    setState('syncing', 'Pulling from Drive…');
    const dump = await getRemoteContent(fileId);
    applyRemoteDump(dump);
    const meta = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=modifiedTime`).then((r) => r.json());
    setConfig({ fileId, lastSyncedModifiedTime: meta.modifiedTime });
    setState('synced', 'Loaded from Drive');
  }

  async function push(fileId) {
    setState('syncing', 'Saving to Drive…');
    const dump = DB.exportAllJSON();
    const meta = await updateRemoteFile(fileId, JSON.stringify(dump));
    setConfig({ fileId, lastSyncedModifiedTime: meta.modifiedTime });
    setState('synced', 'Synced just now');
  }

  /** Shared "we have a fresh token, now reconcile with the cloud file" step used by resume() and reconnect(). */
  async function syncAfterAuth() {
    const { lastSyncedModifiedTime } = getConfig();
    const remote = await findRemoteFile();
    if (remote && remote.modifiedTime !== lastSyncedModifiedTime) {
      await pull(remote.id);
    } else if (remote) {
      setConfig({ fileId: remote.id });
      setState('synced', 'Up to date');
    } else {
      setState('error', 'Cloud backup file was not found (was it deleted in Drive?)');
    }
  }

  /** First-time connect: user picks whether existing cloud data or this browser's data wins. */
  async function connect(clientId) {
    setConfig({ clientId });
    setState('connecting', 'Connecting…');
    try {
      await ensureAccessToken(false);
      const remote = await findRemoteFile();
      if (!remote) {
        const created = await createRemoteFile(JSON.stringify(DB.exportAllJSON()));
        setConfig({ fileId: created.id, lastSyncedModifiedTime: created.modifiedTime, connected: true });
        setState('synced', 'Connected — this browser is now the cloud backup');
        return;
      }
      const loadCloud = confirmAction(
        `A cloud backup already exists (last updated ${new Date(remote.modifiedTime).toLocaleString()}).\n\n` +
          `OK = load the cloud data into this browser (replaces what's here).\n` +
          `Cancel = keep this browser's data and upload it, replacing the cloud copy.`
      );
      setConfig({ fileId: remote.id, connected: true });
      if (loadCloud) {
        await pull(remote.id);
      } else {
        await push(remote.id);
      }
    } catch (e) {
      setState('error', e.message);
      throw e;
    }
  }

  function disconnect() {
    accessToken = null;
    tokenExpiresAt = 0;
    tokenClient = null;
    localStorage.removeItem(CONFIG_KEY);
    clearCachedToken();
    setState('disconnected', '');
  }

  /** Called on every page load: tries a silent token first (no popup). If that fails, connection
      config is left intact and the UI shows "Reconnect" — a page refresh never loses the Drive link. */
  async function resume() {
    const { clientId, connected } = getConfig();
    if (!clientId || !connected) {
      setState('disconnected', '');
      return;
    }
    setState('connecting', 'Checking Google Drive…');
    try {
      await ensureAccessToken(true);
      await syncAfterAuth();
    } catch (e) {
      if (e.message === 'auth_required') {
        setState('auth_required', 'Google Drive connected — click Reconnect to resume syncing this browser.');
      } else {
        setState('error', 'Could not reach Google Drive.');
      }
    }
  }

  /** Explicit user action (button click): one direct token attempt (see requestTokenFromClick). */
  async function reconnect() {
    setState('connecting', 'Reconnecting…');
    try {
      await requestTokenFromClick();
      await syncAfterAuth();
    } catch (e) {
      setState('error', e.message);
      throw e;
    }
  }

  /** Debounced auto-push, triggered by any local data write. Skips silently if not connected. */
  function scheduleAutoPush() {
    if (isApplyingRemote) return;
    const { connected } = getConfig();
    if (!connected) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(autoPush, DEBOUNCE_MS);
  }

  async function autoPush() {
    const { fileId, lastSyncedModifiedTime } = getConfig();
    if (!fileId) return;
    try {
      const remote = await findRemoteFile();
      if (remote && remote.modifiedTime !== lastSyncedModifiedTime) {
        setState('conflict', 'Cloud data changed elsewhere since your last sync — resolve this in Settings before it syncs again.');
        return;
      }
      await push(fileId);
    } catch (e) {
      if (e.message === 'auth_required') {
        setState('auth_required', 'Google Drive connected — click Reconnect in Settings to resume syncing.');
      } else {
        setState('error', e.message);
      }
    }
  }

  /** Manual "Sync Now": a real click, so it's allowed to self-heal an expired/missing token. */
  async function syncNow() {
    const { fileId, clientId } = getConfig();
    if (!clientId) return;
    if (!fileId) return connect(clientId);
    try {
      await requestTokenFromClick();
      await autoPush();
    } catch (e) {
      setState('error', e.message);
      throw e;
    }
  }

  async function resolveConflictKeepLocal() {
    await requestTokenFromClick();
    const { fileId } = getConfig();
    await push(fileId);
  }

  async function resolveConflictUseCloud() {
    await requestTokenFromClick();
    const remote = await findRemoteFile();
    await pull(remote.id);
  }

  window.addEventListener('cst:data-changed', scheduleAutoPush);
  loadCachedToken();

  return {
    getConfig,
    getState,
    onChange,
    connect,
    disconnect,
    resume,
    reconnect,
    syncNow,
    resolveConflictKeepLocal,
    resolveConflictUseCloud,
  };
})();

DriveSync.resume();
