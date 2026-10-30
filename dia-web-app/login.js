'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const notice = $('authNotice');
  const loginTab = $('loginTab');
  const registerTab = $('registerTab');
  let busy = false;

  function showMessage(text, success) {
    DiaAuth.message(notice, text, success);
  }

  function mode(value) {
    const signup = value === 'signup';
    $('loginPanel').hidden = signup;
    $('registerPanel').hidden = !signup;
    loginTab.setAttribute('aria-selected', String(!signup));
    registerTab.setAttribute('aria-selected', String(signup));
    $('authTitle').innerHTML = signup ? 'Make it<br><em>yours.</em>' : 'Welcome<br><em>back.</em>';
    $('authDescription').textContent = signup
      ? 'Create your Dia account and keep your favorite pieces together.'
      : 'Sign in to discover the collection, save your favorites, and keep your bag close.';
    showMessage('');
    const url = new URL(location.href);
    if (signup) url.searchParams.set('mode', 'signup');
    else url.searchParams.delete('mode');
    history.replaceState({}, '', url);
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
      if (DiaAuth.redirectByRole(result.user, result.authMethod)) return;
      throw new Error('This account is not authorized to open that area.');
    } catch (error) {
      showMessage(error.message || 'Email, username, or password is incorrect.');
      $('loginPassword').focus();
    } finally {
      busy = false;
      DiaAuth.setBusy($('loginSubmit'), false);
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
    if (username && !/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) {
      showMessage('Use 3–32 characters for the username: letters, numbers, dots, underscores, or hyphens.');
      $('registerUsername').focus(); return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      showMessage('Enter a valid email address.'); $('registerEmail').focus(); return;
    }
    if (password.length < 12 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      showMessage('Use at least 12 characters, including a letter and a number.'); $('registerPassword').focus(); return;
    }
    if (password !== confirmPassword) {
      showMessage('The passwords do not match.'); $('registerConfirm').focus(); return;
    }
    busy = true;
    showMessage('');
    DiaAuth.setBusy($('registerSubmit'), true, 'Creating your account…');
    try {
      const data = await DiaAuth.request('/api/auth/register', {
        method: 'POST',
        body: { name, username: username || undefined, email, password, confirmPassword }
      });
      if (data.user?.role !== 'user' || data.user.status !== 'active') {
        throw new Error('This account cannot be registered as a customer.');
      }
      $('registerForm').reset();
      window.location.replace('/dashboard');
    } catch (error) {
      showMessage(error.message || 'We could not create your account. Please try again.');
    } finally {
      busy = false;
      DiaAuth.setBusy($('registerSubmit'), false);
    }
  });

  loginTab.addEventListener('click', () => mode('login'));
  registerTab.addEventListener('click', () => mode('signup'));
  $('showRegister').addEventListener('click', () => mode('signup'));
  $('showLogin').addEventListener('click', () => mode('login'));
  DiaAuth.bindPasswordToggles();
  DiaAuth.playBrandIntro();

  (async () => {
    $('authYear').textContent = String(new Date().getFullYear());
    if (new URLSearchParams(location.search).get('mode') === 'signup') mode('signup');
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
                window.location.replace('/dashboard');
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