(function () {
  const form = document.getElementById('loginForm');
  const errorEl = document.getElementById('loginError');
  const btn = document.getElementById('btnSubmit');

  function showError(message) {
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
  }

  const FRIENDLY_ERRORS = {
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/invalid-email': 'That email address looks invalid.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/too-many-requests': 'Too many attempts — please wait a bit and try again.',
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    try {
      await firebase.auth().signInWithEmailAndPassword(
        document.getElementById('email').value.trim(),
        document.getElementById('password').value
      );
      const next = new URLSearchParams(location.search).get('next') || 'index.html';
      location.replace(next);
    } catch (err) {
      showError(FRIENDLY_ERRORS[err.code] || err.message);
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  });
})();
