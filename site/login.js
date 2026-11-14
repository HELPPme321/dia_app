'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const notice = $('authNotice');
  let busy = false;

  function showMessage(text, success) {
    DiaAuth.message(notice, text, success);
  }

  async function mergeGuestCart(sb, userId) {
    try {
      const stored = localStorage.getItem('dia_cart') || localStorage.getItem('dia_guest_cart');
      if (!stored) return;
      const guestItems = JSON.parse(stored);
      if (!Array.isArray(guestItems) || guestItems.length === 0) return;

      for (const item of guestItems) {
        if (!item.productId || !item.size || !item.quantity) continue;
        await sb.from('cart_items').upsert({
          user_id: userId,
          product_id: item.productId,
          size: item.size,
          quantity: item.quantity
        }, { onConflict: 'user_id,product_id,size' });
      }
      localStorage.removeItem('dia_cart');
      localStorage.removeItem('dia_guest_cart');
    } catch (e) {
      console.warn('[Dia] Guest cart merge error:', e);
    }
  }

  $('loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const email = $('loginIdentifier').value.trim();
    const password = $('loginPassword').value;

    if (!email || !password) {
      showMessage('Please enter your email address and password.');
      (!email ? $('loginIdentifier') : $('loginPassword')).focus();
      return;
    }

    busy = true;
    showMessage('');
    DiaAuth.setBusy($('loginSubmit'), true, 'Signing you in…');

    try {
      const sb = DiaAuth.getClient();
      if (!sb || !sb.auth) {
        throw new Error('Authentication service is currently unavailable. Please refresh.');
      }
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) {
        throw new Error(error.message === 'Invalid login credentials' ? 'Incorrect email or password.' : error.message);
      }

      const user = data.user;
      if (!user) throw new Error('Sign-in failed. Please try again.');

      const { data: profile, error: profError } = await sb
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profError || !profile) {
        throw new Error('Could not load account profile. Please try again.');
      }

      if (profile.status !== 'active') {
        await sb.auth.signOut();
        throw new Error('This account is suspended or inactive. Please contact support.');
      }

      // Update last_login_at
      await DiaAuth.touchLastLogin(user.id);

      // Merge guest cart if any
      await mergeGuestCart(sb, user.id);

      // Route according to role
      if (profile.role === 'admin') {
        window.location.replace('/admin');
        return;
      }

      // Customer redirect with cinematic transition
      try { window.sessionStorage.setItem('dia_intro_pending', '1'); } catch {}
      window.location.replace('/');
    } catch (error) {
      showMessage(error.message || 'Email or password is incorrect.');
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
      const sb = window.diaSupabase || (typeof DiaAuth.getClient === 'function' ? DiaAuth.getClient() : null);
      if (sb && sb.auth) {
        const { data: { session } } = await sb.auth.getSession();
        if (session?.user) {
          const { data: profile } = await sb
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

          if (profile && profile.status === 'active') {
            if (profile.role === 'admin') {
              window.location.replace('/admin');
              return;
            }
            window.location.replace('/');
            return;
          }
        }
      }
    } catch (e) {
      console.warn('[Dia] Session check error:', e);
    }
  })();
})();
