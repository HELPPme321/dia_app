'use strict';
(() => {
  let csrfToken = '';

  function message(element,text,success) {
    if (!element) return;
    element.textContent = text || '';
    element.classList.toggle('is-success',Boolean(success));
    element.hidden = !text;
  }

  function failureMessage(response,data,method,url,fallback) {
    let pathname = String(url).split('?')[0];
    try { pathname = new URL(url,window.location.href).pathname; } catch {}
    const serverMessage = data?.error?.message || data?.message;
    if (serverMessage) return serverMessage;
    if (response.status === 404) return 'The request ' + method + ' ' + pathname + ' returned HTTP 404. Check that Dia is running through its Express server.';
    return fallback || 'The request could not be completed. Please try again.';
  }

  async function getCsrf() {
    if (csrfToken) return csrfToken;
    const response = await fetch('/api/auth/csrf',{credentials:'same-origin',headers:{Accept:'application/json'}});
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.csrfToken) throw new Error(failureMessage(response,data,'GET','/api/auth/csrf','Could not start a secure session. Refresh and try again.'));
    csrfToken = data.csrfToken;
    return csrfToken;
  }

  async function request(url,options) {
    const config = options || {};
    const method = (config.method || 'GET').toUpperCase();
    const headers = {Accept:'application/json',...(config.headers || {})};
    let body = config.body;
    if (body !== undefined && body !== null && typeof body !== 'string') {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    if (!['GET','HEAD','OPTIONS'].includes(method)) headers['X-CSRF-Token'] = await getCsrf();
    const response = await fetch(url,{...config,method,body,headers,credentials:'same-origin'});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(failureMessage(response,data,method,url,'Authentication failed. Please try again.'));
      error.status = response.status;
      error.code = data?.error?.code;
      throw error;
    }
    if (data.csrfToken) csrfToken = data.csrfToken;
    return data;
  }

  function setBusy(button,active,loadingText) {
    if (!button) return;
    if (active) {
      if (!button.dataset.idleMarkup) button.dataset.idleMarkup = button.innerHTML;
      button.disabled = true;
      button.setAttribute('aria-busy','true');
      button.innerHTML = '<span class="auth-spinner" aria-hidden="true"></span><span>' + loadingText + '</span>';
    } else {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      if (button.dataset.idleMarkup) {
        button.innerHTML = button.dataset.idleMarkup;
        delete button.dataset.idleMarkup;
      }
    }
  }

  function bindPasswordToggles(root) {
    (root || document).querySelectorAll('[data-password-toggle]').forEach((button) => {
      if (button.dataset.toggleBound === 'true') return;
      button.dataset.toggleBound = 'true';
      button.addEventListener('click',() => {
        const field = document.getElementById(button.dataset.passwordToggle);
        if (!field) return;
        const visible = field.type === 'password';
        field.type = visible ? 'text' : 'password';
        button.textContent = visible ? 'Hide' : 'Show';
        button.setAttribute('aria-label',visible ? 'Hide password' : 'Show password');
        button.setAttribute('aria-pressed',String(visible));
      });
    });
  }

  function redirectByRole(user,authMethod) {
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

  window.DiaAuth = Object.freeze({message,getCsrf,request,setBusy,bindPasswordToggles,redirectByRole});
})();