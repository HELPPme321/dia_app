'use strict';
(() => {
  const $ = (s) => document.querySelector(s);
  const auth = $('#diaAuth');
  const app = $('.app-stage');
  const notice = $('#diaAuthNotice');
  let csrf = '';
  const message = (text, success = false) => {
    notice.textContent = text;
    notice.classList.toggle('success', success);
    notice.hidden = !text;
  };
  async function csrfToken() {
    const r = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
    const d = await r.json();
    if (!r.ok || !d.csrfToken) throw new Error('Could not start a secure session. Refresh and try again.');
    csrf = d.csrfToken;
    return csrf;
  }
  async function api(url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    if (options.body) headers['Content-Type'] = 'application/json';
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      if (!csrf) await csrfToken();
      headers['X-CSRF-Token'] = csrf;
    }
    const r = await fetch(url, { ...options, method, headers, credentials: 'same-origin' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d?.error?.message || 'Sign-in failed. Please try again.'); e.status = r.status; throw e; }
    if (d.csrfToken) csrf = d.csrfToken;
    return d;
  }
  function showAuth(text) {
    auth.hidden = false; app.style.display = 'none';
    if (text) message(text);
  }
  function showApp() { auth.hidden = true; app.style.display = ''; }
  async function credentialResponse(response) {
    message('Verifying your Google account securely…', true);
    const button = $('#googleButton'); button.setAttribute('aria-busy', 'true');
    try {
      const result = await api('/api/auth/google', { method: 'POST', body: JSON.stringify({ credential: response.credential }) });
      message('Signed in. Welcome to Dia+.', true);
      showApp();
    } catch (e) { showAuth(e.message || 'Google sign-in failed. Please try again.'); }
    finally { button.removeAttribute('aria-busy'); }
  }
  async function boot() {
    $('#diaAuthYear').textContent = String(new Date().getFullYear());
    try {
      await csrfToken();
      const config = await api('/api/config');
      const me = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (me.ok) {
        const current = await me.json();
        if (current.user?.role === 'admin') { window.location.href = '/admin'; return; }
        showApp();
      } else showAuth();
      if (config.googleClientId && window.google?.accounts?.id) initializeGoogle(config.googleClientId);
      else if (config.googleClientId) {
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client'; script.async = true; script.defer = true;
        script.onload = () => initializeGoogle(config.googleClientId);
        script.onerror = () => { $('#googleHint').hidden = false; };
        document.head.append(script);
      } else $('#googleHint').hidden = false;
    } catch { showAuth('The authentication service is unavailable. Check that the Dia+ server is running.'); }
  }
  function initializeGoogle(clientId) {
    if (!window.google?.accounts?.id) { $('#googleHint').hidden = false; return; }
    window.google.accounts.id.initialize({ client_id: clientId, callback: credentialResponse, auto_select: false, cancel_on_tap_outside: true });
    window.google.accounts.id.renderButton($('#googleButton'), { type: 'standard', theme: 'outline', size: 'large', shape: 'rectangular', text: 'continue_with', width: Math.min(340, $('#googleButton').clientWidth || 340), logo_alignment: 'left' });
  }
  window.addEventListener('pageshow', () => { if (!auth.hidden) $('#googleButton').setAttribute('aria-busy', 'false'); });
  boot();
})();