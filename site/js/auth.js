// js/auth.js - Dia Fashion Unified Authentication Helpers with Supabase
'use strict';
(function () {
  function message(element, text, success) {
    if (!element) return;
    element.textContent = text || '';
    element.classList.toggle('is-success', Boolean(success));
    element.hidden = !text;
  }

  function setBusy(button, active, loadingText) {
    if (!button) return;
    if (active) {
      if (!button.dataset.idleMarkup) button.dataset.idleMarkup = button.innerHTML;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.innerHTML = '<span class="auth-spinner" aria-hidden="true"></span><span>' + (loadingText || 'Please wait…') + '</span>';
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
      button.addEventListener('click', () => {
        const field = document.getElementById(button.dataset.passwordToggle);
        if (!field) return;
        const visible = field.type === 'password';
        field.type = visible ? 'text' : 'password';
        button.textContent = visible ? 'Hide' : 'Show';
        button.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
        button.setAttribute('aria-pressed', String(visible));
      });
    });
  }

  function getClient() {
    // 1. Try window.diaSupabase
    if (window.diaSupabase && window.diaSupabase.auth) {
      return window.diaSupabase;
    }
    // 2. Try window.getDiaSupabase()
    if (typeof window.getDiaSupabase === 'function') {
      var client = window.getDiaSupabase();
      if (client && client.auth) return client;
    }
    // 3. Try window.getSupabase()
    if (typeof window.getSupabase === 'function') {
      var client2 = window.getSupabase();
      if (client2 && client2.auth) return client2;
    }
    // 4. Try window.supabaseClient
    if (window.supabaseClient && window.supabaseClient.auth) {
      return window.supabaseClient;
    }
    var err = new Error('[Dia Auth] Supabase client is not available or auth service is not initialized.');
    console.error(err.message);
    throw err;
  }

  async function getCurrentUser() {
    try {
      const sb = getClient();
      if (!sb || !sb.auth) return null;
      const { data: { session } } = await sb.auth.getSession();
      return session?.user || null;
    } catch {
      return null;
    }
  }

  async function getProfile(userId) {
    const sb = getClient();
    if (!sb) throw new Error('[Dia Auth] Supabase client is null.');
    const { data, error } = await sb
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) throw error;
    return data;
  }

  async function touchLastLogin(userId) {
    try {
      const sb = getClient();
      if (!sb) return;
      await sb.from('profiles').update({ last_login_at: new Date().toISOString() }).eq('id', userId);
    } catch (e) {
      console.warn('[Dia] Touch login error:', e);
    }
  }

  async function signOut() {
    try {
      const sb = getClient();
      if (sb && sb.auth) {
        await sb.auth.signOut();
      }
    } catch (e) {
      console.warn('[Dia] Sign out error:', e);
    }
  }

  function redirectByRole(profile, options = {}) {
    if (!profile || profile.status !== 'active') return false;
    if (profile.role === 'admin') {
      window.location.replace('/admin');
      return true;
    }
    if (profile.role === 'user') {
      if (options.cinematic === true) {
        try { window.sessionStorage.setItem('dia_intro_pending', '1'); } catch {}
      }
      window.location.replace('/');
      return true;
    }
    return false;
  }

  window.DiaAuth = Object.freeze({
    message,
    setBusy,
    bindPasswordToggles,
    getClient,
    getCurrentUser,
    getProfile,
    touchLastLogin,
    signOut,
    redirectByRole
  });
})();
