'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const notice = $('authNotice');
  let busy = false;

  function showMessage(text, success) {
    DiaAuth.message(notice, text, success);
  }

  $('registerForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;

    const name = $('registerName').value.trim();
    const username = $('registerUsername').value.trim().toLowerCase();
    const email = $('registerEmail').value.trim();
    const password = $('registerPassword').value;
    const confirmPassword = $('registerConfirm').value;

    if (!name || name.length < 2) {
      showMessage('Please provide your full name (at least 2 characters).');
      $('registerName').focus();
      return;
    }
    if (!username || username.length < 3) {
      showMessage('Please choose a username of at least 3 characters.');
      $('registerUsername').focus();
      return;
    }
    if (!email || !email.includes('@')) {
      showMessage('Please enter a valid email address.');
      $('registerEmail').focus();
      return;
    }
    if (password.length < 12) {
      showMessage('Password must be at least 12 characters.');
      $('registerPassword').focus();
      return;
    }
    if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
      showMessage('Password must contain both letters and numbers.');
      $('registerPassword').focus();
      return;
    }
    if (password !== confirmPassword) {
      showMessage('Passwords do not match. Please verify your password.');
      $('registerConfirm').focus();
      return;
    }

    busy = true;
    showMessage('');
    DiaAuth.setBusy($('registerSubmit'), true, 'Creating your account…');

    try {
      const sb = DiaAuth.getClient();
      if (!sb || !sb.auth) {
        throw new Error('Registration service is currently unavailable. Please refresh.');
      }
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
            username
          }
        }
      });

      if (error) throw error;

      if (data.session && data.user) {
        await DiaAuth.touchLastLogin(data.user.id);
        try { window.sessionStorage.setItem('dia_intro_pending', '1'); } catch {}
        window.location.replace('/');
        return;
      }

      showMessage('Account created successfully! Check your email to confirm your account, then sign in.', true);
      $('registerForm').reset();
    } catch (error) {
      showMessage(error.message || 'Could not create account. Please check your information and try again.');
    } finally {
      busy = false;
      DiaAuth.setBusy($('registerSubmit'), false);
    }
  });

  DiaAuth.bindPasswordToggles();

  $('authYear').textContent = String(new Date().getFullYear());
})();
