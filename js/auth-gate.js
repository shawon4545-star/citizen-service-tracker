/* Firebase-backed login gate. Requires js/firebase-config.js and the Firebase compat SDK scripts
   (firebase-app-compat.js, firebase-auth-compat.js) to be loaded before this file.

   Because Firebase Auth checks sign-in state asynchronously (it has to read persisted credentials
   before it knows), this page's real app scripts (db.js, nav.js, dashboard.js, etc.) are NOT loaded as
   static <script> tags — each protected page instead calls AppAuth.requireAuthThenLoad([...]) at the
   very bottom of <body>, which only injects those scripts once Firebase confirms a signed-in user. If
   there's no signed-in user, it redirects to login.html instead, and the data scripts never run at all. */

firebase.initializeApp(FIREBASE_CONFIG);

const AppAuth = (() => {
  function loadScriptsSequentially(srcs) {
    // Every app script (db.js, nav.js, leads.js, etc.) is fetched with a fresh cache-busting query
    // string on every page load — these files change often as the app evolves, and a stale cached
    // copy silently serving old behavior (missing filters, missing fields) is worse than the small
    // extra network cost of always re-fetching them.
    const cacheBust = Date.now();
    return srcs.reduce(
      (p, src) =>
        p.then(
          () =>
            new Promise((resolve, reject) => {
              const s = document.createElement('script');
              s.src = `${src}${src.includes('?') ? '&' : '?'}v=${cacheBust}`;
              s.onload = resolve;
              s.onerror = () => reject(new Error(`Failed to load ${src}`));
              document.body.appendChild(s);
            })
        ),
      Promise.resolve()
    );
  }

  function requireAuthThenLoad(scripts) {
    firebase.auth().onAuthStateChanged((user) => {
      if (!user) {
        const next = encodeURIComponent(location.pathname + location.search);
        location.replace(`login.html?next=${next}`);
        return;
      }
      loadScriptsSequentially(scripts);
    });
  }

  function signOut() {
    firebase.auth().signOut().then(() => (location.href = 'login.html'));
  }

  function currentUserEmail() {
    const user = firebase.auth().currentUser;
    return user ? user.email : '';
  }

  return { requireAuthThenLoad, signOut, currentUserEmail };
})();

/** If we're already signed in and someone lands on login.html directly, skip straight past it. */
(function () {
  if (!/\/login\.html$/.test(location.pathname)) return;
  firebase.auth().onAuthStateChanged((user) => {
    if (user) {
      const next = new URLSearchParams(location.search).get('next') || 'index.html';
      location.replace(next);
    }
  });
})();
