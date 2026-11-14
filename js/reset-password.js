'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const notice = $('resetNotice');
  let busy = false;

  $('resetYear').textContent = String(new Date().getFullYear());
  DiaAuth.bindPasswordToggles();

  // Listen for Supabase password recovery event if token came through URL
  let hasRecoverySession = false;
  (async () => {
    try {
      const sb = window.diaSupabase || (typeof DiaAuth.getClient === 'function' ? DiaAuth.getClient() : null);
      if (sb && sb.auth) {
        const { data: { session } } = await sb.auth.getSession();
        if (session) hasRecoverySession = true;

        sb.auth.onAuthStateChange((event, session) => {
          if (event === 'PASSWORD_RECOVERY') {
            hasRecoverySession = true;
            DiaAuth.message(notice, 'You can now set a new password for your account.', true);
          }
        });
      }
    } catch (e) {
      console.warn('[Dia] Reset auth check:', e);
    }
  })();

  $('resetForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;

    const password = $('newPassword').value;
    const confirm = $('confirmPassword').value;

    if (password.length < 12) {
      DiaAuth.message(notice, 'Password must be at least 12 characters.');
      $('newPassword').focus();
      return;
    }
    if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
      DiaAuth.message(notice, 'Password must include both letters and numbers.');
      $('newPassword').focus();
      return;
    }
    if (password !== confirm) {
      DiaAuth.message(notice, 'Passwords do not match.');
      $('confirmPassword').focus();
      return;
    }

    busy = true;
    DiaAuth.message(notice, '');
    DiaAuth.setBusy($('resetSubmit'), true, 'Updating password…');

    try {
      const sb = DiaAuth.getClient();
      if (!sb || !sb.auth) {
        throw new Error('Password reset service is currently unavailable. Please refresh.');
      }
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw error;

      DiaAuth.message(notice, 'Password updated successfully! Redirecting you to sign in…', true);
      $('resetForm').reset();
      setTimeout(() => {
        window.location.replace('/login');
      }, 1500);
    } catch (err) {
      DiaAuth.message(notice, err.message || 'Could not update password. The link may have expired.');
    } finally {
      busy = false;
      DiaAuth.setBusy($('resetSubmit'), false);
    }
  });
})();
