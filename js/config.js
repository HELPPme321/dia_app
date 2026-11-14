// Supabase Public Configuration for Dia Fashion
// Safe for public frontend usage with Row-Level Security (RLS)
const SUPABASE_URL = 'https://qdmbladogfxqlerlfcbv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_GflfeKfAxwsjuFgLdR56fg_yy1aaH_c';

if (typeof window !== 'undefined') {
  window.SUPABASE_CONFIG = {
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SUPABASE_URL, SUPABASE_ANON_KEY };
}
