'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const notice = $('forgotNotice');
  let busy = false;

  $('forgotYear').textContent = String(new Date().getFullYear());

  $('forgotForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    const email = $('forgotEmail').value.trim();
    if (!email || !email.includes('@')) {
      DiaAuth.message(notice, 'Please provide a valid email address.');
      $('forgotEmail').focus();
      return;
    }

    busy = true;
    DiaAuth.message(notice, '');
    DiaAuth.setBusy($('forgotSubmit'), true, 'Sending recovery link…');

    try {
      const sb = DiaAuth.getClient();
      if (!sb || !sb.auth) {
        throw new Error('Password recovery service is currently unavailable. Please refresh.');
      }
      const redirectTo = window.location.origin + '/reset-password.html';
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;

      DiaAuth.message(notice, 'If an account exists for that email, a password reset link has been sent. Please check your inbox.', true);
      $('forgotForm').reset();
    } catch (err) {
      DiaAuth.message(notice, err.message || 'Could not send recovery link. Please try again.');
    } finally {
      busy = false;
      DiaAuth.setBusy($('forgotSubmit'), false);
    }
  });
})();
