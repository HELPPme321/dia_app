'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const notice = $('authNotice');
  let busy = false;

  function showMessage(text, success) {
    DiaAuth.message(notice, text, success);
  }

  async function roleAwareLogin(identifier, password, rememberMe) {
    const payload = { identifier, password, rememberMe };
    try {
      const customer = await DiaAuth.request('/api/auth/login', { method: 'POST', body: payload });
      if (customer.user?.role === 'user' && customer.user.status === 'active') return { user: customer.user, authMethod: 'password' };
      throw new Error('This account cannot use customer sign-in.');
    } catch (error) {
      if (error.status !== 401 || error.code !== 'INVALID_CREDENTIALS') throw error;
      const administrator = await DiaAuth.request('/api/auth/admin-login', {
        method: 'POST',
        body: { identifier, password }
      });
      if (administrator.user?.role === 'admin' && administrator.user.status === 'active') {
        return { user: administrator.user, authMethod: 'admin' };
      }
      throw error;
    }
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
    DiaAuth.setBusy($('loginSubmit'), true, 'Signing you in…');
    try {
      const result = await roleAwareLogin(identifier, password, $('rememberMe').checked);
      $('loginPassword').value = '';
      if (DiaAuth.redirectByRole(result.user, result.authMethod, { cinematic: true })) return;
      throw new Error('This account is not authorized to open that area.');
    } catch (error) {
      showMessage(error.message || 'Email, username, or password is incorrect.');
      $('loginPassword').focus();
    } finally {
      busy = false;
      DiaAuth.setBusy($('loginSubmit'), false);
    }
  });

  DiaAuth.bindPasswordToggles();

  (async () => {
    $('authYear').textContent = String(new Date().getFullYear());
    const params = new URLSearchParams(location.search);
    if (params.has('loggedOut')) showMessage('You have signed out securely.', true);
    try {
      await DiaAuth.getCsrf();
      const config = await DiaAuth.request('/api/config');
      const current = await DiaAuth.request('/api/auth/me');
      if (current.user) {
        if (DiaAuth.redirectByRole(current.user, current.authMethod)) return;
      }
      if (config.googleClientId) {
        const loadGoogle = () => {
          if (!window.google?.accounts?.id) return;
          $('googleArea').hidden = false;
          window.google.accounts.id.initialize({
            client_id: config.googleClientId,
            callback: async (response) => {
              if (busy) return;
              busy = true;
              showMessage('Verifying your Google account…', true);
              try {
                const data = await DiaAuth.request('/api/auth/google', {
                  method: 'POST', body: { credential: response.credential }
                });
                if (data.user?.role !== 'user') throw new Error('Use administrator sign-in for this account.');
                DiaAuth.redirectByRole(data.user, 'google', { cinematic: true });
              } catch (error) {
                showMessage(error.message || 'Google sign-in failed. Please try again.');
              } finally { busy = false; }
            },
            auto_select: false,
            cancel_on_tap_outside: true
          });
          window.google.accounts.id.renderButton($('googleButton'), {
            type: 'standard', theme: 'outline', size: 'large', shape: 'rectangular',
            text: 'continue_with', width: Math.min(340, $('googleButton').clientWidth || 340)
          });
        };
        if (window.google?.accounts?.id) loadGoogle();
        else {
          const script = document.createElement('script');
          script.src = 'https://accounts.google.com/gsi/client';
          script.async = true; script.defer = true;
          script.onload = loadGoogle;
          script.onerror = () => { $('googleArea').hidden = true; };
          document.head.append(script);
        }
      }
    } catch (error) {
      showMessage(error.message || 'The authentication service is unavailable.');
    }
  })();
})();