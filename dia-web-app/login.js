'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const notice = $('authNotice');
  const loginTab = $('loginTab');
  const registerTab = $('registerTab');
  let csrfToken = '';
  let busy = false;
  function showMessage(text, success = false) {
    notice.textContent = text || '';
    notice.classList.toggle('success', success);
    notice.hidden = !text;
  }
  function mode(value) {
    const signup = value === 'signup';
    $('loginPanel').hidden = signup;
    $('registerPanel').hidden = !signup;
    loginTab.setAttribute('aria-selected', String(!signup));
    registerTab.setAttribute('aria-selected', String(signup));
    $('authTitle').innerHTML = signup ? 'Make it<br><em>yours.</em>' : 'Welcome<br><em>back.</em>';
    $('authDescription').textContent = signup
      ? 'Create your Dia+ account and keep your favorite pieces together.'
      : 'Sign in to explore the collection, save your favorites, and keep your bag close.';
    showMessage('');
    const url = new URL(location.href);
    if (signup) url.searchParams.set('mode', 'signup'); else url.searchParams.delete('mode');
    history.replaceState({}, '', url);
  }
  async function csrf() {
    const response = await fetch('/api/auth/csrf', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.csrfToken) throw new Error(data.error?.message || 'Could not start a secure session. Refresh and try again.');
    csrfToken = data.csrfToken;
  }
  async function api(path, payload) {
    if (!csrfToken) await csrf();
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || 'The request could not be completed. Please try again.');
    if (data.csrfToken) csrfToken = data.csrfToken;
    return data;
  }
  function setBusy(button, active, label) {
    button.disabled = active;
    button.setAttribute('aria-busy', String(active));
    const text = active ? label : button.dataset.label;
    button.innerHTML = active ? '<span>' + label + '</span><span aria-hidden="true">◌</span>' : '<span>' + text + '</span><span aria-hidden="true">↗</span>';
  }
  function prepareBusyButtons() {
    $('loginSubmit').dataset.label = 'Sign in';
    $('registerSubmit').dataset.label = 'Create your account';
  }
  function openDestination(user) {
    if (user?.role === 'admin') location.replace('/admin');
    else location.replace('/dashboard');
  }
  $('loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const identifier = $('loginIdentifier').value.trim();
    const password = $('loginPassword').value;
    if (!identifier || !password) {
      showMessage('Enter your email or username and password.');
      (!identifier ? $('loginIdentifier') : $('loginPassword')).focus();
      return;
    }
    busy = true;
    showMessage('');
    setBusy($('loginSubmit'), true, 'Signing you in…');
    try {
      const data = await api('/api/auth/login', { identifier, password, rememberMe: $('rememberMe').checked });
      if (!data.user || data.user.status !== 'active') throw new Error('This account is not active.');
      $('loginPassword').value = '';
      if (data.user.role !== 'user') throw new Error('Use administrator sign-in for this account.');
      openDestination(data.user);
    } catch (error) {
      showMessage(error.message || 'Email or username or password is incorrect.');
    } finally {
      busy = false;
      setBusy($('loginSubmit'), false);
    }
  });
  $('registerForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const name = $('registerName').value.trim().replace(/\s+/g, ' ');
    const username = $('registerUsername').value.trim().toLowerCase();
    const email = $('registerEmail').value.trim();
    const password = $('registerPassword').value;
    const confirmPassword = $('registerConfirm').value;
    if (name.length < 2) { showMessage('Enter your full name.'); $('registerName').focus(); return; }
    if (username && !/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) { showMessage('Use 3–32 characters for the username: letters, numbers, dots, underscores, or hyphens.'); $('registerUsername').focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) { showMessage('Enter a valid email address.'); $('registerEmail').focus(); return; }
    if (password.length < 12 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) { showMessage('Use at least 12 characters, including a letter and a number.'); $('registerPassword').focus(); return; }
    if (password !== confirmPassword) { showMessage('The passwords do not match.'); $('registerConfirm').focus(); return; }
    busy = true;
    showMessage('');
    setBusy($('registerSubmit'), true, 'Creating your account…');
    try {
      const data = await api('/api/auth/register', { name, username: username || undefined, email, password, confirmPassword });
      if (!data.user || data.user.role !== 'user') throw new Error('This account cannot be registered as a customer.');
      openDestination(data.user);
    } catch (error) {
      showMessage(error.message || 'We could not create your account. Please try again.');
    } finally {
      busy = false;
      setBusy($('registerSubmit'), false);
    }
  });
  document.querySelectorAll('[data-password-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const field = $(button.dataset.passwordToggle);
      const visible = field.type === 'password';
      field.type = visible ? 'text' : 'password';
      button.textContent = visible ? 'Hide' : 'Show';
      button.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
    });
  });
  loginTab.addEventListener('click', () => mode('login'));
  registerTab.addEventListener('click', () => mode('signup'));
  $('showRegister').addEventListener('click', () => mode('signup'));
  $('showLogin').addEventListener('click', () => mode('login'));
  function googleSignIn(clientId) {
    if (!window.google?.accounts?.id || !clientId) return;
    $('googleArea').hidden = false;
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (response) => {
        if (busy) return;
        busy = true;
        showMessage('Verifying your Google account…', true);
        try {
          const data = await api('/api/auth/google', { credential: response.credential });
          if (data.user?.role !== 'user') throw new Error('Use administrator sign-in for this account.');
          openDestination(data.user);
        } catch (error) {
          showMessage(error.message || 'Google sign-in failed. Please try again.');
        } finally {
          busy = false;
        }
      },
      auto_select: false,
      cancel_on_tap_outside: true
    });
    window.google.accounts.id.renderButton($('googleButton'), {
      type: 'standard', theme: 'outline', size: 'large', shape: 'rectangular',
      text: 'continue_with', width: Math.min(360, $('googleButton').clientWidth || 360)
    });
  }
  (async () => {
    $('authYear').textContent = String(new Date().getFullYear());
    prepareBusyButtons();
    if (new URLSearchParams(location.search).get('mode') === 'signup') mode('signup');
    const params = new URLSearchParams(location.search);
    if (params.has('loggedOut')) showMessage('You have signed out securely.', true);
    try {
      await csrf();
      const configResponse = await fetch('/api/config', { credentials: 'same-origin' });
      const config = await configResponse.json().catch(() => ({}));
      const meResponse = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (meResponse.ok) {
        const current = await meResponse.json();
        if (current.user?.role === 'admin' && current.authMethod === 'admin') { location.replace('/admin'); return; }
        if (current.user?.role === 'user') { location.replace('/dashboard'); return; }
      }
      if (config.googleClientId) {
        const activate = () => googleSignIn(config.googleClientId);
        if (window.google?.accounts?.id) activate();
        else {
          const script = document.createElement('script');
          script.src = 'https://accounts.google.com/gsi/client';
          script.async = true; script.defer = true;
          script.onload = activate;
          script.onerror = () => { $('googleArea').hidden = true; };
          document.head.append(script);
        }
      }
    } catch (error) {
      showMessage(error.message || 'The authentication service is unavailable.');
    }
  })();
})();
