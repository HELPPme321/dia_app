'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const form = $('adminLoginForm');
  const button = $('adminSubmit');
  const notice = $('adminNotice');
  const identifier = $('adminIdentifier');
  const password = $('adminPassword');
  let csrfToken = '';
  let busy = false;

  function message(value, success = false) {
    notice.textContent = value || '';
    notice.classList.toggle('success', success);
    notice.hidden = !value;
  }
  async function csrf() {
    const response = await fetch('/api/auth/csrf', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.csrfToken) throw new Error(data.error?.message || 'A secure sign-in session could not be started. Refresh and try again.');
    csrfToken = data.csrfToken;
  }
  async function api(path, options = {}) {
    if (!csrfToken) await csrf();
    const response = await fetch(path, {
      ...options,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error?.message || 'Sign-in failed. Check your credentials and try again.');
      error.status = response.status;
      throw error;
    }
    if (data.csrfToken) csrfToken = data.csrfToken;
    return data;
  }
  function setBusy(active) {
    button.disabled = active;
    button.setAttribute('aria-busy', String(active));
    button.innerHTML = active
      ? '<span>Verifying credentials…</span><span aria-hidden="true">◌</span>'
      : '<span>Enter the studio</span><span aria-hidden="true">↗</span>';
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const value = identifier.value.trim();
    const secret = password.value;
    if (!value || !secret) {
      message('Enter your email or username and password.');
      (!value ? identifier : password).focus();
      return;
    }
    busy = true;
    message('');
    setBusy(true);
    try {
      const data = await api('/api/auth/admin-login', {
        method: 'POST',
        body: JSON.stringify({ identifier: value, password: secret })
      });
      if (!data.user || data.user.role !== 'admin' || data.user.status !== 'active') {
        throw new Error('This account does not have active Administrator access.');
      }
      password.value = '';
      window.location.replace('/admin');
    } catch (error) {
      message(error.message || 'The email or username or password is incorrect.');
      password.focus();
      password.select();
    } finally {
      busy = false;
      setBusy(false);
    }
  });
  $('togglePassword').addEventListener('click', () => {
    const show = password.type === 'password';
    password.type = show ? 'text' : 'password';
    $('togglePassword').textContent = show ? 'Hide' : 'Show';
    $('togglePassword').setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });
  (async () => {
    try {
      await csrf();
      const response = await fetch('/api/auth/me', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (response.ok) {
        const current = await response.json();
        if (current.user?.role === 'admin' && current.user?.status === 'active' && current.authMethod === 'admin') {
          window.location.replace('/admin');
          return;
        }
        if (current.user) message('You are already signed in with another account. Sign out before switching accounts.');
      }
      if (new URLSearchParams(location.search).has('loggedOut')) message('You have signed out securely.', true);
    } catch (error) {
      message(error.message || 'The authentication service is unavailable.');
    }
  })();
})();
