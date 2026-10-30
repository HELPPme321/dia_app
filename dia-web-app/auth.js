'use strict';
(() => {
  let csrfToken = '';
  const introKey = 'dia-brand-intro-seen-v1';

  function message(element, text, success) {
    if (!element) return;
    element.textContent = text || '';
    element.classList.toggle('is-success', Boolean(success));
    element.hidden = !text;
  }

  function failureMessage(response, data, method, url) {
    const messageText = data?.error?.message || data?.message;
    if (messageText) return messageText;
    if (response.status === 404) {
      let route = url;
      try { route = new URL(url, window.location.href).pathname; } catch {}
      return 'The sign-in service could not be reached (' + method + ' ' + route + '). Open Dia through its Express server and check that it is up to date.';
    }
    return 'The request could not be completed. Please try again.';
  }

  async function getCsrf() {
    if (csrfToken) return csrfToken;
    const response = await fetch('/api/auth/csrf', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.csrfToken) {
      throw new Error(failureMessage(response, data, 'GET', '/api/auth/csrf'));
    }
    csrfToken = data.csrfToken;
    return csrfToken;
  }

  async function request(url, options) {
    const config = options || {};
    const method = (config.method || 'GET').toUpperCase();
    const headers = { Accept: 'application/json', ...(config.headers || {}) };
    let body = config.body;
    if (body !== undefined && body !== null && typeof body !== 'string') {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      headers['X-CSRF-Token'] = await getCsrf();
    }
    const response = await fetch(url, {
      ...config,
      method,
      body,
      headers,
      credentials: 'same-origin'
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(failureMessage(response, data, method, url));
      error.status = response.status;
      error.code = data?.error?.code;
      throw error;
    }
    if (data.csrfToken) csrfToken = data.csrfToken;
    return data;
  }

  function setBusy(button, active, loadingText) {
    if (!button) return;
    if (active) {
      if (!button.dataset.idleMarkup) button.dataset.idleMarkup = button.innerHTML;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.innerHTML = '<span class="auth-spinner" aria-hidden="true"></span><span>' + loadingText + '</span>';
      return;
    }
    button.disabled = false;
    button.removeAttribute('aria-busy');
    if (button.dataset.idleMarkup) {
      button.innerHTML = button.dataset.idleMarkup;
      delete button.dataset.idleMarkup;
    }
  }

  function bindPasswordToggles(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-password-toggle]').forEach((button) => {
      if (button.dataset.toggleBound === 'true') return;
      button.dataset.toggleBound = 'true';
      button.addEventListener('click', () => {
        const field = document.getElementById(button.dataset.passwordToggle);
        if (!field) return;
        const visible = field.type === 'password';
        field.type = visible ? 'text' : 'password';
        button.textContent = visible ? 'Hide' : 'Show';
        button.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
      });
    });
  }

  function redirectByRole(user, authMethod) {
    if (!user || user.status !== 'active') return false;
    if (user.role === 'admin' && authMethod === 'admin') {
      window.location.replace('/admin');
      return true;
    }
    if (user.role === 'user') {
      window.location.replace('/dashboard');
      return true;
    }
    return false;
  }

  function playBrandIntro() {
    const stage = document.getElementById('diaIntro');
    if (!stage || stage.dataset.initialized === 'true') return;
    stage.dataset.initialized = 'true';

    let alreadySeen = false;
    try {
      alreadySeen = window.sessionStorage.getItem(introKey) === 'seen';
      if (!alreadySeen) window.sessionStorage.setItem(introKey, 'seen');
    } catch {
      alreadySeen = window.__diaIntroSeen === true;
      window.__diaIntroSeen = true;
    }
    if (alreadySeen) return;

    const skip = document.getElementById('diaIntroSkip');
    const reducedMotion = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    stage.hidden = false;
    stage.setAttribute('aria-hidden', 'false');
    if (skip) skip.tabIndex = 0;
    stage.classList.add(reducedMotion ? 'is-reduced' : 'is-playing');

    let finished = false;
    let hideTimer = null;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (hideTimer) window.clearTimeout(hideTimer);
      stage.classList.add('is-skipped');
      stage.setAttribute('aria-hidden', 'true');
      if (skip) skip.tabIndex = -1;
      window.setTimeout(() => {
        stage.hidden = true;
        stage.classList.remove('is-playing', 'is-reduced', 'is-skipped');
      }, 320);
    };
    if (skip) skip.addEventListener('click', finish, { once: true });
    hideTimer = window.setTimeout(finish, reducedMotion ? 850 : 4500);
  }

  window.DiaAuth = Object.freeze({
    message,
    getCsrf,
    request,
    setBusy,
    bindPasswordToggles,
    redirectByRole,
    playBrandIntro
  });
})();