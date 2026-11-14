// js/supabase-client.js - Centralized Supabase client initialization for Dia+
(function () {
  'use strict';

  if (typeof window === 'undefined') return;

  function createDiaClient() {
    // If already created, return the singleton instance
    if (window.diaSupabase && window.diaSupabase.auth) {
      return window.diaSupabase;
    }

    // 1. Verify Configuration (window.DIA_SUPABASE_CONFIG)
    var cfg = window.DIA_SUPABASE_CONFIG || window.SUPABASE_CONFIG || window.DIA_CONFIG;
    if (!cfg) {
      var configError = new Error('[Dia Supabase Error] Supabase configuration missing: window.DIA_SUPABASE_CONFIG is not defined.');
      console.error(configError.message);
      throw configError;
    }

    var url = cfg.supabaseUrl || cfg.url;
    var key = cfg.supabaseKey || cfg.publishableKey || cfg.anonKey;

    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      var urlError = new Error('[Dia Supabase Error] Invalid or missing Project URL in window.DIA_SUPABASE_CONFIG: ' + url);
      console.error(urlError.message);
      throw urlError;
    }

    if (!key || typeof key !== 'string' || key.length < 10) {
      var keyError = new Error('[Dia Supabase Error] Invalid or missing Publishable Key in window.DIA_SUPABASE_CONFIG.');
      console.error(keyError.message);
      throw keyError;
    }

    if (key.includes('service' + '_role') || key.startsWith('eyJ') && key.length > 200) {
      var secError = new Error('[Dia Security Violation] Secret keys must NEVER be used in frontend files.');
      console.error(secError.message);
      throw secError;
    }

    // 2. Verify Supabase Library from self-hosted vendor bundle
    var supabaseLib = window.supabase;
    if (!supabaseLib || typeof supabaseLib.createClient !== 'function') {
      var libError = new Error('[Dia Supabase Error] Supabase JavaScript library not loaded. Make sure /js/vendor/supabase.js loads before config.js and application scripts.');
      console.error(libError.message);
      throw libError;
    }

    // 3. Initialize exactly one reusable Supabase client using createClient()
    try {
      var client = supabaseLib.createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storage: window.localStorage
        }
      });

      if (!client || !client.auth) {
        var authError = new Error('[Dia Supabase Error] Supabase client created but .auth property is unavailable.');
        console.error(authError.message);
        throw authError;
      }

      // Store the initialized client consistently as window.diaSupabase
      window.diaSupabase = client;
      window.supabaseClient = client;
      return client;
    } catch (err) {
      console.error('[Dia] Critical Supabase client initialization error:', err);
      throw err;
    }
  }

  // Getters that return window.diaSupabase and never silently return null
  window.getDiaSupabase = function () {
    if (window.diaSupabase && window.diaSupabase.auth) {
      return window.diaSupabase;
    }
    return createDiaClient();
  };

  window.getSupabase = function () {
    return window.getDiaSupabase();
  };

  // Eager initialization attempt if CDN script is already evaluated
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    try {
      createDiaClient();
    } catch (e) {
      // Eager notice logged; runtime callers will receive the explicit error
      console.warn('[Dia] Eager initialization notice:', e.message);
    }
  }
})();
