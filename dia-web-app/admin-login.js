'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const form = $('adminLoginForm');
  const button = $('adminSubmit');
  const notice = $('adminNotice');
  const identifier = $('adminIdentifier');
  const password = $('adminPassword');
  let busy = false;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const value = identifier.value.trim();
    const secret = password.value;
    if (!value || !secret) {
      DiaAuth.message(notice, 'Enter your email or username and password.', false);
      (!value ? identifier : password).focus();
      return;
    }
    busy = true;
    DiaAuth.message(notice, '', false);
    DiaAuth.setBusy(button, true, 'Verifying access…');
    try {
      const data = await DiaAuth.request('/api/auth/admin-login', {
        method: 'POST',
        body: { identifier: value, password: secret }
      });
      if (data.user?.role !== 'admin' || data.user.status !== 'active') {
        throw new Error('This account does not have active Administrator access.');
      }
      password.value = '';
      window.location.replace('/admin');
    } catch (error) {
      DiaAuth.message(notice, error.message || 'Email, username, or password is incorrect.', false);
      password.focus();
    } finally {
      busy = false;
      DiaAuth.setBusy(button, false);
    }
  });

  DiaAuth.bindPasswordToggles();
  DiaAuth.playBrandIntro();

  (async () => {
    $('adminYear').textContent = String(new Date().getFullYear());
    try {
      await DiaAuth.getCsrf();
      const current = await DiaAuth.request('/api/auth/me');
      if (current.user?.role === 'admin' && current.user.status === 'active' && current.authMethod === 'admin') {
        window.location.replace('/admin');
        return;
      }
      if (current.user) {
        DiaAuth.message(notice, 'You are signed in with another account. Sign out before switching accounts.', false);
        return;
      }
      if (new URLSearchParams(location.search).has('loggedOut')) {
        DiaAuth.message(notice, 'You have signed out securely.', true);
      }
    } catch (error) {
      DiaAuth.message(notice, error.message || 'The authentication service is unavailable.', false);
    }
  })();
})();