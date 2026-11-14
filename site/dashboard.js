// dashboard.js - Dia Fashion Customer Dashboard direct Supabase integration
'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  let currentUser = null;
  let currentProfile = null;
  let pendingAvatarBlob = null;

  function notify(text, success = false) {
    const target = $('dashboardNotice');
    if (!target) return;
    target.textContent = text || '';
    target.classList.toggle('is-success', success);
    target.hidden = !text;
  }

  function notifyProfile(text, success = false) {
    const target = $('profNotice');
    if (!target) return;
    target.textContent = text || '';
    target.classList.toggle('is-success', success);
    target.hidden = !text;
  }

  function setAvatarUI(pictureUrl, name = '') {
    const headerAvatar = $('headerAvatar');
    const previewImg = $('profAvatarImg');
    const placeholder = $('profAvatarPlaceholder');
    const removeBtn = $('profAvatarRemoveBtn');

    if (placeholder && name) {
      placeholder.textContent = (name.trim() || 'D').slice(0, 1).toUpperCase();
    }

    if (pictureUrl) {
      if (headerAvatar) {
        headerAvatar.src = pictureUrl;
        headerAvatar.hidden = false;
      }
      if (previewImg) {
        previewImg.src = pictureUrl;
        previewImg.hidden = false;
      }
      if (placeholder) placeholder.hidden = true;
      if (removeBtn) removeBtn.hidden = false;
    } else {
      if (headerAvatar) headerAvatar.hidden = true;
      if (previewImg) previewImg.hidden = true;
      if (placeholder) placeholder.hidden = false;
      if (removeBtn) removeBtn.hidden = true;
    }
  }

  function showOrders(orders) {
    const list = $('orderList');
    if (!list) return;
    list.replaceChildren();

    if (!orders || !orders.length) {
      const empty = document.createElement('p');
      empty.className = 'dashboard-empty';
      empty.textContent = 'No orders yet. Your first Dia order will appear here after checkout.';
      list.append(empty);
      return;
    }

    for (const order of orders) {
      const row = document.createElement('article');
      row.className = 'dashboard-order';

      const summary = document.createElement('div');
      const number = document.createElement('strong');
      number.textContent = order.order_number || order.orderNumber || ('DIA-' + String(order.id).slice(0, 8).toUpperCase());

      const meta = document.createElement('small');
      const date = order.created_at || order.createdAt ? new Date(order.created_at || order.createdAt).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Date unavailable';
      const itemsList = order.order_items || order.items || [];
      const count = Array.isArray(itemsList) ? itemsList.length : 0;
      meta.textContent = date + ' · ' + count + (count === 1 ? ' item' : ' items');

      const status = document.createElement('span');
      const st = String(order.status || 'pending').toLowerCase();
      status.className = 'dashboard-status ' + st;
      status.textContent = st.replaceAll('_', ' ');

      summary.append(number, meta, status);

      const value = document.createElement('div');
      value.className = 'dashboard-order-meta';
      const total = document.createElement('strong');
      total.textContent = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(Number(order.total) || 0);
      value.append(total);

      row.append(summary, value);
      list.append(row);
    }
  }

  async function loadWishlist() {
    const container = $('wishlistContainer');
    if (!container || !currentUser) return;
    try {
      const sb = window.getSupabase();
      const { data: wishData, error: wishErr } = await sb
        .from('wishlist_items')
        .select('product_id')
        .eq('user_id', currentUser.id);

      if (wishErr) throw wishErr;

      const productIds = (wishData || []).map((w) => w.product_id);
      if (!productIds.length) {
        container.innerHTML = '<p class="dashboard-empty">No pieces saved yet. Explore the shop and tap ♡ to save your favorites.</p>';
        return;
      }

      const { data: prods, error: prodErr } = await sb
        .from('products')
        .select('*')
        .in('id', productIds);

      if (prodErr) throw prodErr;

      const matches = prods || [];
      if (!matches.length) {
        container.innerHTML = '<p class="dashboard-empty">No pieces saved yet. Explore the shop and tap ♡ to save your favorites.</p>';
        return;
      }

      container.innerHTML = '<div class="wishlist-grid">' + matches.map((p) => `
        <article class="wishlist-card">
          <img src="${p.image_url || '/assets/dia-editorial.webp'}" alt="${p.name}">
          <h4 style="margin:4px 0 2px;font-family:var(--display, serif);font-size:20px;color:#f2ead7">${p.name}</h4>
          <strong style="color:#f0d58a;font-size:14px">${new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(p.price)}</strong>
          <a href="/#shop" class="dashboard-button primary" style="text-align:center;margin-top:6px">View Piece ↗</a>
        </article>
      `).join('') + '</div>';
    } catch (e) {
      console.warn('[Dia] Wishlist load error:', e);
      container.innerHTML = '<p class="dashboard-empty">Could not load saved pieces.</p>';
    }
  }

  // Avatar Selection & Browser-side 256x256 resizing
  if ($('profAvatarChooseBtn')) {
    $('profAvatarChooseBtn').addEventListener('click', () => $('profAvatarInput')?.click());
  }

  if ($('profAvatarInput')) {
    $('profAvatarInput').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        notifyProfile('Please select a valid image file (JPEG or PNG).');
        return;
      }

      try {
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Failed to load image.'));
          img.src = objectUrl;
        });
        URL.revokeObjectURL(objectUrl);

        // Resize and center-crop to 256x256 JPEG in browser
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, 256, 256);

        // Convert to Blob and check size < 150 KB
        canvas.toBlob((blob) => {
          if (!blob) {
            notifyProfile('Could not process avatar image.');
            return;
          }
          if (blob.size > 150 * 1024) {
            notifyProfile('Avatar image exceeds 150 KB limit even after resize.');
            return;
          }
          pendingAvatarBlob = blob;
          const previewUrl = URL.createObjectURL(blob);
          setAvatarUI(previewUrl, $('profNameInput')?.value || '');
          notifyProfile('Photo resized to 256×256 JPEG (' + Math.round(blob.size / 1024) + ' KB). Click "Save Profile Changes" to upload.', true);
        }, 'image/jpeg', 0.85);
      } catch (err) {
        notifyProfile(err.message || 'Error processing image.');
      }
    });
  }

  if ($('profAvatarRemoveBtn')) {
    $('profAvatarRemoveBtn').addEventListener('click', async () => {
      if (!currentUser) return;
      const btn = $('profAvatarRemoveBtn');
      btn.disabled = true;
      try {
        const sb = window.getSupabase();
        await sb.from('profiles').update({ avatar_path: null }).eq('id', currentUser.id);
        pendingAvatarBlob = null;
        if ($('profAvatarInput')) $('profAvatarInput').value = '';
        setAvatarUI(null, $('profNameInput')?.value || '');
        notifyProfile('Profile picture removed successfully.', true);
      } catch (err) {
        notifyProfile(err.message || 'Could not remove profile picture.');
      } finally {
        btn.disabled = false;
      }
    });
  }

  // Profile Form Submission
  if ($('profileForm')) {
    $('profileForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentUser) return;
      const saveBtn = $('profSaveBtn');
      if (saveBtn) saveBtn.disabled = true;
      notifyProfile('');

      try {
        const sb = window.getSupabase();
        const name = $('profNameInput').value.trim();
        const phone = $('profPhoneInput').value.trim() || null;
        const address_line = $('profAddressInput').value.trim() || null;
        const barangay = $('profBarangayInput').value.trim() || null;
        const city = $('profCityInput').value.trim() || null;
        const province = $('profProvinceInput').value.trim() || null;
        const postal_code = $('profPostalInput').value.trim() || null;

        const updatePayload = {
          name,
          phone,
          address_line,
          barangay,
          city,
          province,
          postal_code
        };

        // If new avatar was chosen, upload to avatars bucket
        if (pendingAvatarBlob) {
          const avatarPath = `${currentUser.id}/avatar.jpg`;
          const { error: uploadErr } = await sb.storage
            .from('avatars')
            .upload(avatarPath, pendingAvatarBlob, {
              contentType: 'image/jpeg',
              upsert: true
            });

          if (uploadErr) throw new Error('Avatar upload failed: ' + uploadErr.message);

          updatePayload.avatar_path = avatarPath;
          pendingAvatarBlob = null;
        }

        const { error: updateErr } = await sb
          .from('profiles')
          .update(updatePayload)
          .eq('id', currentUser.id);

        if (updateErr) throw updateErr;

        $('customerName').textContent = name || 'there';
        if (updatePayload.avatar_path) {
          const { data: pubData } = sb.storage.from('avatars').getPublicUrl(updatePayload.avatar_path);
          setAvatarUI(pubData.publicUrl + '?t=' + Date.now(), name);
        } else {
          setAvatarUI(null, name);
        }

        notifyProfile('Profile details saved successfully.', true);
      } catch (err) {
        notifyProfile(err.message || 'Could not save profile changes.');
      } finally {
        if (saveBtn) saveBtn.disabled = false;
      }
    });
  }

  // Dashboard Tabs
  const tabs = {
    tabOrders: $('panelOrders'),
    tabWishlist: $('panelWishlist'),
    tabProfile: $('panelProfile')
  };

  Object.keys(tabs).forEach((tabId) => {
    const btn = $(tabId);
    if (!btn) return;
    btn.addEventListener('click', () => {
      Object.keys(tabs).forEach((id) => {
        const targetBtn = $(id);
        const panel = tabs[id];
        if (targetBtn) {
          targetBtn.classList.toggle('active', id === tabId);
          targetBtn.setAttribute('aria-selected', String(id === tabId));
        }
        if (panel) panel.hidden = id !== tabId;
      });
      if (tabId === 'tabWishlist') loadWishlist();
    });
  });

  // Sign out button
  if ($('dashboardSignOut')) {
    $('dashboardSignOut').addEventListener('click', async () => {
      const button = $('dashboardSignOut');
      button.disabled = true;
      try {
        const sb = window.diaSupabase || (typeof window.getDiaSupabase === 'function' ? window.getDiaSupabase() : window.getSupabase());
        if (sb && sb.auth) {
          await sb.auth.signOut();
        }
        location.replace('/login?loggedOut=1');
      } catch (error) {
        notify(error.message || 'Sign out failed.');
        button.disabled = false;
      }
    });
  }

  // Initialization
  (async () => {
    try {
      const sb = window.diaSupabase || (typeof window.getDiaSupabase === 'function' ? window.getDiaSupabase() : window.getSupabase());
      if (!sb || !sb.auth) {
        throw new Error('Supabase authentication client is not available.');
      }
      const { data: { session } } = await sb.auth.getSession();
      if (!session?.user) {
        location.replace('/login');
        return;
      }

      currentUser = session.user;
      const { data: profile, error: profErr } = await sb
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();

      if (profErr || !profile) {
        location.replace('/login');
        return;
      }

      if (profile.role === 'admin') {
        location.replace('/admin');
        return;
      }

      if (profile.status !== 'active') {
        await sb.auth.signOut();
        location.replace('/login');
        return;
      }

      currentProfile = profile;
      $('customerName').textContent = profile.name || 'there';
      $('accountStatus').textContent = 'Active';
      $('accountRole').textContent = 'Customer';

      // Populate Profile Fields
      if ($('profNameInput')) $('profNameInput').value = profile.name || '';
      if ($('profEmailDisplay')) $('profEmailDisplay').value = profile.email || currentUser.email || '';
      if ($('profUsernameDisplay')) $('profUsernameDisplay').value = profile.username || '';
      if ($('profPhoneInput')) $('profPhoneInput').value = profile.phone || '';
      if ($('profAddressInput')) $('profAddressInput').value = profile.address_line || '';
      if ($('profBarangayInput')) $('profBarangayInput').value = profile.barangay || '';
      if ($('profCityInput')) $('profCityInput').value = profile.city || '';
      if ($('profProvinceInput')) $('profProvinceInput').value = profile.province || '';
      if ($('profPostalInput')) $('profPostalInput').value = profile.postal_code || '';

      if (profile.avatar_path) {
        const { data: pubData } = sb.storage.from('avatars').getPublicUrl(profile.avatar_path);
        setAvatarUI(pubData.publicUrl, profile.name || '');
      } else {
        setAvatarUI(null, profile.name || '');
      }

      // Load orders with order_items
      const { data: orders, error: ordersErr } = await sb
        .from('orders')
        .select('*, order_items(*)')
        .order('created_at', { ascending: false });

      if (!ordersErr) {
        $('orderCount').textContent = String((orders || []).length);
        showOrders(orders || []);
      }
    } catch (error) {
      console.error('[Dia] Dashboard load error:', error);
      notify(error.message || 'Your account could not be loaded.');
      if ($('orderList')) $('orderList').textContent = 'Refresh this page or sign in again to reload your order history.';
    }
  })();
})();
