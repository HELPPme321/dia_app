// Dia+ Luxury Fashion - Supabase Configuration
// Pinned jsDelivr CDN supabase-js v2 script loads prior to this file.

window.DIA_SUPABASE_CONFIG = {
  supabaseUrl: 'https://qdmbladogfxqlerlfcbv.supabase.co',
  supabaseKey: 'sb_publishable_GflfeKfAxwsjuFgLdR56fg_yy1aaH_c',
  url: 'https://qdmbladogfxqlerlfcbv.supabase.co',
  publishableKey: 'sb_publishable_GflfeKfAxwsjuFgLdR56fg_yy1aaH_c',
  anonKey: 'sb_publishable_GflfeKfAxwsjuFgLdR56fg_yy1aaH_c'
};

// Aliases for compatibility across modules
window.DIA_CONFIG = window.DIA_SUPABASE_CONFIG;
window.SUPABASE_CONFIG = window.DIA_SUPABASE_CONFIG;

// Attempt eager initialization if Supabase CDN library is loaded
(function () {
  function tryInit() {
    if (window.diaSupabase && window.diaSupabase.auth) {
      return window.diaSupabase;
    }
    var supabaseLib = window.supabase;
    if (supabaseLib && typeof supabaseLib.createClient === 'function') {
      try {
        var client = supabaseLib.createClient(
          window.DIA_SUPABASE_CONFIG.supabaseUrl,
          window.DIA_SUPABASE_CONFIG.supabaseKey,
          {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true,
              storage: typeof window !== 'undefined' ? window.localStorage : undefined
            }
          }
        );
        window.diaSupabase = client;
        window.supabaseClient = client;
        return client;
      } catch (err) {
        console.error('[Dia] Client initialization error in config.js:', err);
      }
    }
    return null;
  }

  tryInit();

  window.getDiaSupabase = window.getDiaSupabase || function () {
    if (window.diaSupabase && window.diaSupabase.auth) return window.diaSupabase;
    var c = tryInit();
    if (c && c.auth) return c;
    throw new Error('[Dia Supabase Error] Supabase library not loaded. Make sure the jsDelivr CDN script is loaded before config.js.');
  };

  window.getSupabase = window.getDiaSupabase;
})();
