'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const notice = $('adminNotice');
  let busy = false;

  function showMessage(text, success) {
    DiaAuth.message(notice, text, success);
  }

  $('adminLoginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;

    const email = $('adminIdentifier').value.trim();
    const password = $('adminPassword').value;

    if (!email || !password) {
      showMessage('Enter your administrator email and password.');
      (!email ? $('adminIdentifier') : $('loginPassword')).focus();
      return;
    }

    busy = true;
    showMessage('');
    DiaAuth.setBusy($('adminSubmit'), true, 'Verifying administrator access…');

    try {
      const sb = DiaAuth.getClient();
      if (!sb || !sb.auth) {
        throw new Error('Administrator authentication service is currently unavailable. Please refresh.');
      }
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) {
        throw new Error(error.message === 'Invalid login credentials' ? 'Incorrect administrator email or password.' : error.message);
      }

      const user = data.user;
      if (!user) throw new Error('Sign-in failed.');

      const { data: profile, error: profError } = await sb
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profError || !profile || profile.role !== 'admin' || profile.status !== 'active') {
        await sb.auth.signOut();
        throw new Error('This account does not have active administrator access.');
      }

      await DiaAuth.touchLastLogin(user.id);
      window.location.replace('/admin');
    } catch (error) {
      showMessage(error.message || 'Administrator sign-in failed.');
      $('adminPassword').focus();
    } finally {
      busy = false;
      DiaAuth.setBusy($('adminSubmit'), false);
    }
  });

  DiaAuth.bindPasswordToggles();

  (async () => {
    $('adminYear').textContent = String(new Date().getFullYear());
    try {
      const sb = window.diaSupabase || (typeof DiaAuth.getClient === 'function' ? DiaAuth.getClient() : null);
      if (sb && sb.auth) {
        const { data: { session } } = await sb.auth.getSession();
        if (session?.user) {
          const { data: profile } = await sb
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

          if (profile && profile.role === 'admin' && profile.status === 'active') {
            window.location.replace('/admin');
          }
        }
      }
    } catch (e) {
      console.warn('[Dia] Admin session check error:', e);
    }
  })();
})();
