'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const notice = $('authNotice');
  let busy = false;

  function showMessage(text, success = false) {
    DiaAuth.message(notice, text, success);
  }

  $('registerForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;

    const name = $('registerName').value.trim().replace(/\s+/g, ' ');
    const username = $('registerUsername').value.trim().toLowerCase();
    const email = $('registerEmail').value.trim();
    const password = $('registerPassword').value;
    const confirmPassword = $('registerConfirm').value;

    if (name.length < 2) {
      showMessage('Enter your full name.');
      $('registerName').focus();
      return;
    }
    if (!username) {
      showMessage('Enter a username.');
      $('registerUsername').focus();
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      showMessage('Enter a valid email address.');
      $('registerEmail').focus();
      return;
    }
    if (password.length < 12 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      showMessage('Use at least 12 characters, including a letter and a number.');
      $('registerPassword').focus();
      return;
    }
    if (password !== confirmPassword) {
      showMessage('The passwords do not match.');
      $('registerConfirm').focus();
      return;
    }

    busy = true;
    showMessage('');
    DiaAuth.setBusy($('registerSubmit'), true, 'Creating your account…');
    try {
      const data = await DiaAuth.request('/api/auth/register', {
        method: 'POST',
        body: { name, username, email, password, confirmPassword }
      });
      if (data.user?.role !== 'user' || data.user.status !== 'active') {
        throw new Error('This account cannot be registered as a customer.');
      }
      $('registerForm').reset();
      showMessage('Account created. Welcome to Dia.', true);
      if (!DiaAuth.redirectByRole(data.user, 'password', { cinematic: true })) {
        throw new Error('Your account was created, but we could not open your Dia session. Please sign in.');
      }
    } catch (error) {
      showMessage(error.message || 'We could not create your account. Please try again.');
    } finally {
      busy = false;
      DiaAuth.setBusy($('registerSubmit'), false);
    }
  });

  DiaAuth.bindPasswordToggles();

  (async () => {
    $('authYear').textContent = String(new Date().getFullYear());
    try {
      await DiaAuth.getCsrf();
      const current = await DiaAuth.request('/api/auth/me');
      if (current.user) DiaAuth.redirectByRole(current.user, current.authMethod);
    } catch (error) {
      showMessage(error.message || 'The authentication service is unavailable.');
    }
  })();
})();
