// js/storefront.js - Dia Fashion Storefront direct Supabase integration
'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const money = (v) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(Number(v) || 0);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function normalizePhone(raw) {
    let p = String(raw || '').trim().replace(/[\s\-()]/g, '');
    if (/^09\d{9}$/.test(p)) {
      return '+63' + p.slice(1);
    }
    if (/^\+639\d{9}$/.test(p)) {
      return p;
    }
    if (/^9\d{9}$/.test(p)) {
      return '+63' + p;
    }
    return p;
  }

  let user = null;
  let userProfile = null;
  let products = [];
  let cart = [];
  let wishlist = new Set();
  let recentlyViewed = [];
  let toastTimer = null;
  let slide = 0;
  let slideTimer = null;
  let paused = false;
  let activeCategory = 'all';
  let activeSize = 'all';
  let activeSort = 'default';
  let searchQuery = '';
  let stockOnly = false;
  let quickViewProduct = null;
  let selectedSize = '';
  let lastAddClick = 0;
  let lastAddKey = '';
  const debounceTimers = new Map();

  const slides = Array.from(document.querySelectorAll('.hero-slide'));
  const dots = Array.from(document.querySelectorAll('.hero-dot'));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Local storage for guest state & recent views
  try {
    const storedWish = JSON.parse(localStorage.getItem('dia_wishlist') || '[]');
    if (Array.isArray(storedWish)) wishlist = new Set(storedWish);
    const storedRecent = JSON.parse(localStorage.getItem('dia_recent') || '[]');
    if (Array.isArray(storedRecent)) recentlyViewed = storedRecent;
  } catch (e) {}

  function saveWishlist() {
    try { localStorage.setItem('dia_wishlist', JSON.stringify([...wishlist])); } catch (e) {}
  }
  function saveRecent() {
    try { localStorage.setItem('dia_recent', JSON.stringify(recentlyViewed.slice(0, 4))); } catch (e) {}
  }
  function saveGuestCart() {
    try {
      localStorage.setItem('dia_cart', JSON.stringify(cart));
      localStorage.setItem('dia_guest_cart', JSON.stringify(cart));
    } catch (e) {}
  }

  // Custom Cursor
  const cursor = $('customCursor');
  if (cursor && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    window.addEventListener('mousemove', (e) => {
      cursor.style.transform = 'translate(' + (e.clientX - 16) + 'px, ' + (e.clientY - 16) + 'px)';
    });
    document.addEventListener('mouseover', (e) => {
      if (e.target.closest('button, a, input, select, .product-card, .look-card, .hero-3d-floating')) {
        cursor.classList.add('active');
      } else {
        cursor.classList.remove('active');
      }
    });
  }

  // Page Intro fade out
  setTimeout(() => {
    const intro = $('pageIntro');
    if (intro) intro.classList.add('done');
  }, 1200);

  // Reveal on scroll
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-revealed');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  document.querySelectorAll('.section, .promise-strip, .looks-section, .story-band').forEach((el) => {
    el.classList.add('reveal-init');
    revealObserver.observe(el);
  });

  function toast(message) {
    const t = $('storeToast');
    if (!t) return;
    t.textContent = message;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3000);
  }

  function updateNav() {
    const isLoggedIn = !!user;
    if ($('loginLink')) $('loginLink').hidden = isLoggedIn;
    if ($('accountLink')) $('accountLink').hidden = !isLoggedIn;
    if ($('mobileLoginLink')) $('mobileLoginLink').hidden = isLoggedIn;
    if ($('mobileAccountLink')) $('mobileAccountLink').hidden = !isLoggedIn;

    if (isLoggedIn) {
      const isAdmin = userProfile?.role === 'admin';
      const dest = isAdmin ? '/admin' : '/dashboard';
      const label = isAdmin ? 'Admin studio' : 'My account';

      if ($('accountLink')) {
        $('accountLink').href = dest;
        if ($('navAccountLabel')) $('navAccountLabel').textContent = label;
      }
      if ($('mobileAccountLink')) {
        $('mobileAccountLink').href = dest;
        if ($('mobileNavAccountLabel')) $('mobileNavAccountLabel').textContent = label;
      }

      const pic = userProfile?.avatar_path
        ? window.getSupabase().storage.from('avatars').getPublicUrl(userProfile.avatar_path).data.publicUrl
        : null;

      if (pic) {
        if ($('navAvatarImg')) { $('navAvatarImg').src = pic; $('navAvatarImg').hidden = false; }
        if ($('mobileNavAvatarImg')) { $('mobileNavAvatarImg').src = pic; $('mobileNavAvatarImg').hidden = false; }
      } else {
        if ($('navAvatarImg')) $('navAvatarImg').hidden = true;
        if ($('mobileNavAvatarImg')) $('mobileNavAvatarImg').hidden = true;
      }
    }
  }

  const sizeGuides = {
    Tees: {
      title: 'T-Shirts & Tops Size Guide (Centimeters)',
      cols: ['Size', 'Chest (cm)', 'Length (cm)', 'Shoulder (cm)'],
      rows: [['S', '108', '71', '50'], ['M', '114', '73', '52'], ['L', '120', '75', '54'], ['XL', '126', '77', '56']],
      note: 'Cut for an intentional relaxed unisex drape. For oversized fit stay true to size; for standard fit, size down.'
    },
    Shirts: {
      title: 'Overshirts & Blouses Size Guide (Centimeters)',
      cols: ['Size', 'Chest (cm)', 'Length (cm)', 'Sleeve (cm)', 'Shoulder (cm)'],
      rows: [['S', '112', '72', '61', '49'], ['M', '118', '74', '62.5', '51'], ['L', '124', '76', '64', '53'], ['XL', '130', '78', '65.5', '55']],
      note: 'Designed for versatile modular layering over tees or worn standalone.'
    },
    Pants: {
      title: 'Denim & Trousers Size Guide',
      cols: ['Size', 'Waist (in)', 'Waist (cm)', 'Inseam (in)', 'Inseam (cm)'],
      rows: [['S', '28 - 30', '74', '31', '79'], ['M', '31 - 32', '80', '32', '81'], ['L', '33 - 34', '86', '32', '81'], ['XL', '35 - 36', '92', '33', '84']],
      note: 'Wide straight leg cut intended to break cleanly over sneakers or boots.'
    },
    Dresses: {
      title: 'Dresses & Corsetry Size Guide (Centimeters)',
      cols: ['Size', 'Bust (cm)', 'Waist (cm)', 'Hip (cm)', 'Length (cm)'],
      rows: [['XS', '80 - 84', '62 - 66', '88 - 92', '84'], ['S', '84 - 88', '66 - 70', '92 - 96', '86'], ['M', '88 - 92', '70 - 74', '96 - 100', '88'], ['L', '92 - 98', '74 - 80', '100 - 106', '90']],
      note: 'Fitted bodice with flex boning and rear closure for custom contouring.'
    },
    Caps: {
      title: 'Headwear Size Guide',
      cols: ['Size', 'Crown Circumference', 'Brim Length', 'Adjustment'],
      rows: [['One size', '54 - 61 cm (21.2 - 24 in)', '7.2 cm', 'Antiqued brass slider buckle']],
      note: 'Universal unisex fit with unstructured low profile crown.'
    }
  };

  function renderProducts() {
    const grid = $('productGrid');
    if (!grid) return;
    let list = products.slice();

    if (activeCategory !== 'all') {
      list = list.filter((p) => (p.category || '').toLowerCase() === activeCategory.toLowerCase());
    }
    if (activeSize !== 'all') {
      list = list.filter((p) => Array.isArray(p.sizes) && p.sizes.includes(activeSize));
    }
    if (stockOnly) {
      list = list.filter((p) => Number(p.stock) > 0);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q) || (p.color || '').toLowerCase().includes(q));
    }

    if (activeSort === 'price-asc') list.sort((a, b) => a.price - b.price);
    else if (activeSort === 'price-desc') list.sort((a, b) => b.price - a.price);
    else if (activeSort === 'newest') list.reverse();

    if ($('productCountLabel')) $('productCountLabel').textContent = 'Current selection / ' + (list.length < 10 ? '0' : '') + list.length + ' pieces';
    if ($('catalogLabel')) $('catalogLabel').textContent = products.length ? 'Dia Authentic Catalog (' + products.length + ' pieces)' : 'Collection loading…';

    const hasFilter = activeCategory !== 'all' || activeSize !== 'all' || stockOnly || searchQuery.trim() || activeSort !== 'default';
    if ($('resetFilters')) $('resetFilters').hidden = !hasFilter;

    if (!list.length) {
      grid.innerHTML = '<div class="shop-empty"><h3>No pieces found</h3><p>We could not find any items matching your selected filters.</p><button class="gold-button" id="emptyResetBtn" type="button">Reset All Filters</button></div>';
      const eb = $('emptyResetBtn');
      if (eb) eb.addEventListener('click', resetAllFilters);
      return;
    }

    grid.innerHTML = list.map((p, i) => {
      const image = p.image || '/assets/dia-editorial.webp';
      const modelImage = p.modelImage || p.image;
      const isLowStock = Number(p.stock) > 0 && Number(p.stock) <= 15;
      const isSoldOut = Number(p.stock) <= 0;
      const isWish = wishlist.has(p.id);

      let badgeText = p.tag || 'Atelier Edit';
      let badgeClass = 'product-badge';
      if (isSoldOut) { badgeText = 'Sold out'; badgeClass += ' sold-out'; }
      else if (isLowStock) { badgeText = 'Low stock (' + p.stock + ')'; badgeClass += ' low-stock'; }

      return '<article class="product-card" data-card-id="' + esc(p.id) + '">'
        + '<button class="card-wishlist ' + (isWish ? 'active' : '') + '" type="button" data-wish="' + esc(p.id) + '" aria-label="Save to wishlist">' + (isWish ? '♥' : '♡') + '</button>'
        + '<div class="product-image" data-quickview="' + esc(p.id) + '">'
        + '<img src="' + esc(image) + '" srcset="' + esc(image.replace('.webp', '-480w.webp')) + ' 480w, ' + esc(image) + ' 736w" sizes="(max-width: 620px) 45vw, (max-width: 900px) 44vw, 260px" width="360" height="360" alt="' + esc(p.name) + '" loading="lazy" decoding="async">'
        + (modelImage !== image ? '<img class="model-swap-img" src="' + esc(modelImage) + '" alt="' + esc(p.name) + ' model" loading="lazy">' : '')
        + '<span class="' + badgeClass + '">' + esc(badgeText) + '</span>'
        + '<span class="quick-view-badge">Quick view</span>'
        + '</div>'
        + '<div class="product-info">'
        + '<div class="product-meta"><span>' + esc(p.category) + '</span><span>' + (i < 9 ? '0' : '') + (i + 1) + ' / ' + (list.length < 10 ? '0' : '') + list.length + '</span></div>'
        + '<h3>' + esc(p.name) + '</h3>'
        + '<p>' + esc(p.description || 'A considered Dia atelier piece.') + '</p>'
        + '<div class="product-bottom">'
        + '<span class="product-price">' + money(p.price) + '</span>'
        + '<button class="add-button" type="button" data-add="' + esc(p.id) + '" ' + (isSoldOut ? 'disabled' : '') + '>' + (isSoldOut ? 'Sold out' : 'Add to bag') + '</button>'
        + '</div></div></article>';
    }).join('');

    // Parallax card tilt
    grid.querySelectorAll('.product-card').forEach((card) => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        card.style.transform = 'perspective(800px) rotateY(' + (x * 9) + 'deg) rotateX(' + (-y * 9) + 'deg) translateY(-6px)';
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = '';
      });
    });

    grid.querySelectorAll('[data-add]').forEach((btn) => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      addToBag(btn.dataset.add);
    }));
    grid.querySelectorAll('[data-quickview]').forEach((item) => item.addEventListener('click', () => openQuickView(item.dataset.quickview)));
    grid.querySelectorAll('[data-wish]').forEach((btn) => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleWishlist(btn.dataset.wish);
    }));
  }

  async function toggleWishlist(id) {
    const sb = window.getSupabase();
    if (wishlist.has(id)) {
      wishlist.delete(id);
      toast('Removed from saved wishlist.');
      if (user) {
        try {
          await sb.from('wishlist_items').delete().eq('user_id', user.id).eq('product_id', id);
        } catch (e) {
          console.warn('[Dia] Wishlist delete error:', e);
        }
      }
    } else {
      wishlist.add(id);
      toast('Saved to your wishlist.');
      if (user) {
        try {
          await sb.from('wishlist_items').upsert({ user_id: user.id, product_id: id });
        } catch (e) {
          console.warn('[Dia] Wishlist save error:', e);
        }
      }
    }
    saveWishlist();
    renderProducts();
  }

  function resetAllFilters() {
    activeCategory = 'all';
    activeSize = 'all';
    activeSort = 'default';
    stockOnly = false;
    searchQuery = '';
    if ($('shopSearch')) $('shopSearch').value = '';
    if ($('sizeFilter')) $('sizeFilter').value = 'all';
    if ($('priceSort')) $('priceSort').value = 'default';
    if ($('stockOnly')) $('stockOnly').checked = false;
    document.querySelectorAll('.filter-tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.category === 'all');
    });
    renderProducts();
  }

  function openQuickView(id) {
    const p = products.find((item) => String(item.id) === String(id));
    if (!p) return;
    quickViewProduct = p;

    if (!recentlyViewed.includes(p.id)) {
      recentlyViewed.unshift(p.id);
      saveRecent();
      renderRecentlyViewed();
    }

    if ($('qvCategory')) $('qvCategory').textContent = p.category || 'Dia Selection';
    if ($('quickViewTitle')) $('quickViewTitle').textContent = p.name;
    if ($('qvPrice')) $('qvPrice').textContent = money(p.price);
    if ($('qvDescription')) $('qvDescription').textContent = p.description || '';
    if ($('qvFabric')) $('qvFabric').textContent = p.fabricFit || '100% fine cotton. Standard unisex relaxed drape.';
    if ($('qvImage')) {
      $('qvImage').src = p.image || '/assets/dia-editorial.webp';
      $('qvImage').alt = p.name;
    }

    const stock = Number(p.stock) || 0;
    if ($('qvStockNotice')) {
      $('qvStockNotice').textContent = stock > 0 ? ('In stock: ' + stock + ' units') : 'Currently out of stock';
      $('qvStockNotice').style.color = stock <= 5 ? '#dba27e' : 'var(--sage)';
    }

    const sizes = Array.isArray(p.sizes) && p.sizes.length ? p.sizes : ['One size'];
    selectedSize = sizes[0];
    const chips = $('qvSizes');
    if (chips) {
      chips.innerHTML = sizes.map((s, i) => '<button class="size-chip ' + (i === 0 ? 'active' : '') + '" type="button" data-size="' + esc(s) + '">' + esc(s) + '</button>').join('');
      chips.querySelectorAll('.size-chip').forEach((btn) => btn.addEventListener('click', () => {
        chips.querySelectorAll('.size-chip').forEach((c) => c.classList.remove('active'));
        btn.classList.add('active');
        selectedSize = btn.dataset.size;
      }));
    }

    const addBtn = $('qvAddBag');
    if (addBtn) {
      addBtn.disabled = stock <= 0;
      addBtn.textContent = stock <= 0 ? 'Sold out' : 'Add to bag ↗';
    }
    if ($('quickViewDialog')) $('quickViewDialog').showModal();
  }

  if ($('openSizeGuide')) {
    $('openSizeGuide').addEventListener('click', () => {
      if (!quickViewProduct) return;
      const guide = sizeGuides[quickViewProduct.category] || sizeGuides.Tees;
      if ($('sizeGuideTitle')) $('sizeGuideTitle').innerHTML = guide.title;
      let html = '<table class="size-table"><thead><tr>' + guide.cols.map((c) => '<th>' + esc(c) + '</th>').join('') + '</tr></thead><tbody>';
      guide.rows.forEach((r) => {
        html += '<tr>' + r.map((v) => '<td>' + esc(v) + '</td>').join('') + '</tr>';
      });
      html += '</tbody></table><p class="size-note">' + esc(guide.note) + '</p>';
      if ($('sizeGuideContent')) $('sizeGuideContent').innerHTML = html;
      if ($('sizeGuideDialog')) $('sizeGuideDialog').showModal();
    });
  }

  if ($('sizeGuideClose')) $('sizeGuideClose').addEventListener('click', () => $('sizeGuideDialog').close());
  if ($('quickViewClose')) $('quickViewClose').addEventListener('click', () => $('quickViewDialog').close());

  if ($('qvAddBag')) {
    $('qvAddBag').addEventListener('click', () => {
      if (!quickViewProduct || !quickViewProduct.id) return;
      addToBag(quickViewProduct.id, selectedSize);
      if ($('quickViewDialog')) $('quickViewDialog').close();
    });
  }

  if ($('qvShareBtn')) {
    $('qvShareBtn').addEventListener('click', () => {
      if (!quickViewProduct) return;
      const url = window.location.origin + '/#shop';
      navigator.clipboard.writeText(url).then(() => {
        toast('Product link copied to clipboard.');
      }).catch(() => {
        toast('Share: ' + quickViewProduct.name);
      });
    });
  }

  function renderRecentlyViewed() {
    const row = $('recentlyViewedGrid');
    const section = $('recentlyViewedSection');
    if (!row || !section) return;
    if (!recentlyViewed.length) { section.hidden = true; return; }
    const items = recentlyViewed.map((id) => products.find((p) => p.id === id)).filter(Boolean);
    if (!items.length) { section.hidden = true; return; }
    section.hidden = false;
    row.innerHTML = items.map((p) => '<article class="product-card" data-quickview="' + esc(p.id) + '"><div class="product-image"><img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy"></div><div class="product-info" style="padding:14px"><h3>' + esc(p.name) + '</h3><div class="product-price">' + money(p.price) + '</div></div></article>').join('');
    row.querySelectorAll('[data-quickview]').forEach((c) => c.addEventListener('click', () => openQuickView(c.dataset.quickview)));
  }

  // Cart Drawer & Shipping Calculations
  const FREE_SHIPPING_TARGET = 2500;
  const SHIPPING_FEE = 120;

  async function loadProducts() {
    const grid = $('productGrid');
    if (grid) {
      grid.innerHTML = '<div class="product-skeleton"><div class="skeleton-img"></div><div class="skeleton-line skeleton-title"></div><div class="skeleton-line skeleton-price"></div></div>'
        + '<div class="product-skeleton"><div class="skeleton-img"></div><div class="skeleton-line skeleton-title"></div><div class="skeleton-line skeleton-price"></div></div>'
        + '<div class="product-skeleton"><div class="skeleton-img"></div><div class="skeleton-line skeleton-title"></div><div class="skeleton-line skeleton-price"></div></div>'
        + '<div class="product-skeleton"><div class="skeleton-img"></div><div class="skeleton-line skeleton-title"></div><div class="skeleton-line skeleton-price"></div></div>';
    }

    try {
      const sb = window.getSupabase();
      const { data, error } = await sb
        .from('products')
        .select('*')
        .eq('status', 'active')
        .order('sort_order', { ascending: true });

      if (error) throw error;

      products = (data || []).map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        description: p.description,
        price: Number(p.price) || 0,
        color: p.color,
        sizes: p.sizes,
        image: p.image_url,
        modelImage: p.hover_image_url || p.image_url,
        imagePosition: p.image_position,
        tag: p.tag,
        stock: Number(p.stock) || 0,
        sort_order: p.sort_order
      }));

      renderProducts();
      renderRecentlyViewed();
    } catch (err) {
      console.error('[Dia] Error loading products:', err);
      products = [];
      if (grid) {
        grid.innerHTML = '<div class="shop-empty"><h3>Collection temporarily unavailable</h3><p>Could not connect to the Dia catalog. Please try again.</p><button class="gold-button" id="retryProductsBtn" type="button">Reload Collection</button></div>';
        const rb = $('retryProductsBtn');
        if (rb) rb.addEventListener('click', loadProducts);
      }
      if ($('catalogLabel')) $('catalogLabel').textContent = 'Catalog connection error';
    }
  }

  async function loadCart() {
    const sb = window.getSupabase();
    if (user) {
      try {
        const { data, error } = await sb
          .from('cart_items')
          .select('product_id, size, quantity');

        if (error) throw error;

        cart = (data || []).map((row) => {
          const prod = products.find((p) => String(p.id) === String(row.product_id));
          return {
            productId: row.product_id,
            name: prod ? prod.name : 'Dia Piece',
            size: row.size,
            quantity: Number(row.quantity) || 1,
            price: prod ? prod.price : 0,
            image: prod ? prod.image : '/assets/dia-editorial.webp',
            color: prod?.color || ''
          };
        });
      } catch (e) {
        console.warn('[Dia] Failed loading DB cart, falling back to local:', e);
        try { cart = JSON.parse(localStorage.getItem('dia_cart') || '[]'); } catch { cart = []; }
      }
    } else {
      try { cart = JSON.parse(localStorage.getItem('dia_cart') || '[]'); } catch { cart = []; }
    }
    renderCart();
  }

  async function mergeGuestCart(userId) {
    if (!userId) return;
    try {
      const stored = localStorage.getItem('dia_cart') || localStorage.getItem('dia_guest_cart');
      if (!stored) return;
      const guestItems = JSON.parse(stored);
      if (!Array.isArray(guestItems) || !guestItems.length) return;

      const sb = window.getSupabase();
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
      console.warn('[Dia] Merge guest cart error:', e);
    }
  }

  function renderCart() {
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    if ($('bagCount')) $('bagCount').textContent = count;
    if ($('bagCountTitle')) $('bagCountTitle').textContent = '(' + count + ')';

    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const isFree = subtotal >= FREE_SHIPPING_TARGET;
    const shipping = cart.length === 0 ? 0 : (isFree ? 0 : SHIPPING_FEE);
    const total = subtotal + shipping;

    if ($('shippingBarFill') && $('shippingBarPercent') && $('shippingBarMsg')) {
      const pct = Math.min(100, Math.round((subtotal / FREE_SHIPPING_TARGET) * 100));
      $('shippingBarFill').style.width = pct + '%';
      $('shippingBarPercent').textContent = pct + '%';
      if (isFree) {
        $('shippingBarMsg').textContent = '✓ Qualified for Free Nationwide Delivery!';
      } else {
        $('shippingBarMsg').textContent = 'Add ' + money(FREE_SHIPPING_TARGET - subtotal) + ' for Free Delivery';
      }
    }

    const scrollArea = $('bagScrollArea');
    const prevScroll = scrollArea ? scrollArea.scrollTop : 0;

    if (!cart.length) {
      if ($('bagItems')) {
        $('bagItems').innerHTML = '<div class="bag-empty">'
          + '<div class="bag-empty-icon" aria-hidden="true">'
          + '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>'
          + '</div>'
          + '<h3>Your bag is empty</h3>'
          + '<p>Your selection awaits. Explore our authentic atelier collection to begin.</p>'
          + '<button class="gold-button" id="bagEmptyShopBtn" type="button">Explore Collection <span aria-hidden="true">↗</span></button>'
          + '</div>';
        const emptyShopBtn = $('bagEmptyShopBtn');
        if (emptyShopBtn) {
          emptyShopBtn.addEventListener('click', () => {
            closeBag();
            $('shop')?.scrollIntoView({ behavior: 'smooth' });
          });
        }
      }
    } else {
      if ($('bagItems')) {
        $('bagItems').innerHTML = cart.map((item) => {
          const p = products.find((prod) => String(prod.id) === String(item.productId));
          const colorText = item.color || p?.color || '';
          const metaParts = [item.size ? 'Size: ' + item.size : null, colorText ? colorText : null].filter(Boolean).join(' · ');
          return '<article class="bag-row" data-cart-row="' + esc(item.productId) + '::' + esc(item.size) + '">'
            + '<img class="bag-row-img" src="' + esc(item.image || '/assets/dia-editorial.webp') + '" alt="' + esc(item.name) + '">'
            + '<div class="bag-row-details">'
            + '<h3 class="bag-row-title">' + esc(item.name) + '</h3>'
            + '<p class="bag-row-meta">' + esc(metaParts) + '</p>'
            + '<div class="bag-row-actions">'
            + '<div class="qty-stepper">'
            + '<button class="qty-btn" type="button" data-dec="' + esc(item.productId) + '" data-size="' + esc(item.size) + '" aria-label="Decrease quantity">−</button>'
            + '<span class="qty-val" aria-label="Quantity">' + item.quantity + '</span>'
            + '<button class="qty-btn" type="button" data-inc="' + esc(item.productId) + '" data-size="' + esc(item.size) + '" aria-label="Increase quantity">+</button>'
            + '</div>'
            + '<button class="remove-bag" type="button" data-remove="' + esc(item.productId) + '" data-size="' + esc(item.size) + '">Remove</button>'
            + '<strong class="bag-row-price">' + money(item.price * item.quantity) + '</strong>'
            + '</div>'
            + '</div>'
            + '</article>';
        }).join('');

        $('bagItems').querySelectorAll('[data-remove]').forEach((btn) => btn.addEventListener('click', () => removeItem(btn.dataset.remove, btn.dataset.size)));
        $('bagItems').querySelectorAll('[data-dec]').forEach((btn) => btn.addEventListener('click', () => updateQuantity(btn.dataset.dec, btn.dataset.size, -1)));
        $('bagItems').querySelectorAll('[data-inc]').forEach((btn) => btn.addEventListener('click', () => updateQuantity(btn.dataset.inc, btn.dataset.size, 1)));
      }
    }

    if (scrollArea) scrollArea.scrollTop = prevScroll;

    if ($('bagSubtotal')) $('bagSubtotal').textContent = money(subtotal);
    if ($('bagShipping')) $('bagShipping').textContent = cart.length === 0 ? '₱0' : (isFree ? 'FREE' : money(shipping));
    if ($('bagTotal')) $('bagTotal').textContent = money(total);
    if ($('checkoutOpen')) $('checkoutOpen').disabled = !cart.length;
  }

  async function addToBag(id, chosenSize) {
    const now = Date.now();
    const sizeKey = chosenSize || 'One size';
    const clickKey = id + '::' + sizeKey;
    if (now - lastAddClick < 250 && lastAddKey === clickKey) return;
    lastAddClick = now;
    lastAddKey = clickKey;

    const p = products.find((item) => String(item.id) === String(id));
    if (!p) return;
    if (Number(p.stock) <= 0) {
      toast('This piece is currently out of stock.');
      return;
    }
    const finalSize = chosenSize || (Array.isArray(p.sizes) && p.sizes.length ? p.sizes[0] : 'One size');

    const prevCart = JSON.parse(JSON.stringify(cart));
    const existing = cart.find((item) => item.productId === p.id && item.size === finalSize);
    if (existing) {
      existing.quantity = Math.min(99, existing.quantity + 1);
    } else {
      cart.push({ productId: p.id, name: p.name, size: finalSize, quantity: 1, price: p.price, image: p.image, color: p.color || '' });
    }

    renderCart();
    toast(p.name + ' added to your bag.');
    openBag();

    if (user) {
      try {
        const sb = window.getSupabase();
        const curQty = existing ? existing.quantity : 1;
        const { error } = await sb.from('cart_items').upsert({
          user_id: user.id,
          product_id: p.id,
          size: finalSize,
          quantity: curQty
        }, { onConflict: 'user_id,product_id,size' });
        if (error) throw error;
      } catch (error) {
        cart = prevCart;
        renderCart();
        toast('Could not sync with bag: ' + (error.message || 'Error'));
      }
    } else {
      saveGuestCart();
    }
  }

  async function updateQuantity(productId, size, delta) {
    const item = cart.find((i) => i.productId === productId && i.size === size);
    if (!item) return;
    const prevCart = JSON.parse(JSON.stringify(cart));
    const newQty = item.quantity + delta;
    if (newQty <= 0) {
      cart = cart.filter((i) => !(i.productId === productId && i.size === size));
    } else {
      item.quantity = Math.min(99, newQty);
    }
    renderCart();

    const key = productId + '::' + size;
    if (debounceTimers.has(key)) clearTimeout(debounceTimers.get(key));

    if (user) {
      debounceTimers.set(key, setTimeout(async () => {
        debounceTimers.delete(key);
        try {
          const sb = window.getSupabase();
          if (newQty <= 0) {
            await sb.from('cart_items').delete().eq('user_id', user.id).eq('product_id', productId).eq('size', size);
          } else {
            await sb.from('cart_items').upsert({
              user_id: user.id,
              product_id: productId,
              size: size,
              quantity: newQty
            }, { onConflict: 'user_id,product_id,size' });
          }
        } catch (error) {
          cart = prevCart;
          renderCart();
          toast('Could not update quantity.');
        }
      }, 300));
    } else {
      saveGuestCart();
    }
  }

  async function removeItem(productId, size) {
    const prevCart = JSON.parse(JSON.stringify(cart));
    cart = cart.filter((i) => !(i.productId === productId && i.size === size));
    renderCart();

    const key = productId + '::' + size;
    if (debounceTimers.has(key)) {
      clearTimeout(debounceTimers.get(key));
      debounceTimers.delete(key);
    }

    if (user) {
      try {
        const sb = window.getSupabase();
        await sb.from('cart_items').delete().eq('user_id', user.id).eq('product_id', productId).eq('size', size);
      } catch (error) {
        cart = prevCart;
        renderCart();
        toast('Could not remove item.');
      }
    } else {
      saveGuestCart();
    }
  }

  let lastActiveElement = null;

  function openBag() {
    lastActiveElement = document.activeElement;
    const bag = $('bagDrawer');
    if (!bag) return;
    bag.inert = false;
    bag.classList.add('open');
    bag.setAttribute('aria-hidden', 'false');
    if ($('bagBackdrop')) $('bagBackdrop').hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('bagClose')?.focus(), 60);
  }

  function closeBag() {
    const bag = $('bagDrawer');
    if (!bag) return;
    bag.inert = true;
    bag.classList.remove('open');
    bag.setAttribute('aria-hidden', 'true');
    if ($('bagBackdrop')) $('bagBackdrop').hidden = true;
    document.body.style.overflow = '';
    if (lastActiveElement && typeof lastActiveElement.focus === 'function') {
      lastActiveElement.focus();
    } else {
      $('bagOpen')?.focus();
    }
  }

  let savedProfileAddress = '';
  let isDifferentAddress = false;

  async function prefillCheckout() {
    if (!user) return;
    try {
      const sb = window.getSupabase();
      const { data: p } = await sb.from('profiles').select('*').eq('id', user.id).single();
      userProfile = p || userProfile;
      if (p) {
        if ($('checkoutName')) $('checkoutName').value = p.name || '';
        if ($('checkoutEmail')) $('checkoutEmail').value = p.email || user.email || '';
        if ($('checkoutPhone')) $('checkoutPhone').value = p.phone || '';

        const parts = [p.address_line, p.barangay, p.city, p.province, p.postal_code].filter(Boolean);
        if (parts.length) {
          savedProfileAddress = parts.join(', ');
          if ($('checkoutAddress')) $('checkoutAddress').value = savedProfileAddress;
          if ($('diffAddressToggle')) {
            $('diffAddressToggle').style.display = 'inline';
            $('diffAddressToggle').textContent = 'Use a different address';
          }
          isDifferentAddress = false;
        }
        if ($('saveAddressLabel')) $('saveAddressLabel').style.display = 'flex';
      }
    } catch (e) {
      if (user.email && $('checkoutEmail')) $('checkoutEmail').value = user.email;
    }
  }

  if ($('diffAddressToggle')) {
    $('diffAddressToggle').addEventListener('click', () => {
      isDifferentAddress = !isDifferentAddress;
      if (isDifferentAddress) {
        $('checkoutAddress').value = '';
        $('checkoutAddress').focus();
        $('diffAddressToggle').textContent = 'Revert to saved address';
      } else {
        $('checkoutAddress').value = savedProfileAddress;
        $('diffAddressToggle').textContent = 'Use a different address';
      }
    });
  }

  async function checkout(event) {
    event.preventDefault();
    const button = $('checkoutSubmit');
    button.disabled = true;
    $('checkoutError').textContent = '';

    try {
      const form = new FormData(event.currentTarget);
      const customerName = form.get('customerName')?.trim();
      const rawPhone = form.get('customerPhone')?.trim();
      const customerAddress = form.get('customerAddress')?.trim();

      if (!customerName || customerName.length < 2) {
        throw new Error('Please enter your full name (at least 2 characters).');
      }

      const p_phone = normalizePhone(rawPhone);
      if (!/^\+639\d{9}$/.test(p_phone)) {
        throw new Error('Please enter a valid Philippine mobile number (e.g. 09XXXXXXXXX or +639XXXXXXXXX).');
      }

      if (!customerAddress || customerAddress.length < 6) {
        throw new Error('Please enter a complete delivery address.');
      }

      if (!cart.length) {
        throw new Error('Your bag is empty.');
      }

      // Format items array for RPC place_order - NEVER send prices
      const p_items = cart.map((item) => ({
        product_id: item.productId,
        size: item.size || 'One size',
        quantity: Number(item.quantity) || 1
      }));

      const sb = window.getSupabase();
      const idempotencyKey = crypto.randomUUID();

      const { data: orderResult, error: orderError } = await sb.rpc('place_order', {
        p_items,
        p_customer_name: customerName,
        p_phone,
        p_shipping_address: customerAddress,
        p_idempotency_key: idempotencyKey
      });

      if (orderError) {
        const msg = orderError.message || 'Order could not be placed.';
        if (msg.toLowerCase().includes('stock')) {
          throw new Error('One or more pieces in your bag has insufficient stock. Please adjust quantities.');
        }
        if (msg.toLowerCase().includes('size')) {
          throw new Error('An invalid size was specified for one of your selections.');
        }
        throw new Error(msg);
      }

      // If user selected "Save this address", persist to profiles table
      if ($('saveAddressToProfile') && $('saveAddressToProfile').checked && user) {
        sb.from('profiles').update({
          phone: p_phone,
          address_line: customerAddress.slice(0, 200)
        }).eq('id', user.id).then(() => {}).catch(() => {});
      }

      // Empty cart in database and local
      if (user) {
        await sb.from('cart_items').delete().eq('user_id', user.id);
      }
      cart = [];
      saveGuestCart();
      renderCart();

      const orderNumber = orderResult?.orderNumber || orderResult?.id || 'Confirmed';
      $('checkoutFormView').style.display = 'none';
      $('checkoutSuccessView').style.display = 'block';
      $('checkoutSuccessMsg').textContent = 'Thank you, ' + customerName + '. Order ' + orderNumber + ' has been placed with the Dia Atelier. No payment was charged.';
    } catch (error) {
      $('checkoutError').textContent = error.message || 'Checkout failed. Please try again.';
    } finally {
      button.disabled = false;
    }
  }

  if ($('checkoutDoneBtn')) {
    $('checkoutDoneBtn').addEventListener('click', () => {
      $('checkoutDialog').close();
      $('checkoutFormView').style.display = 'block';
      $('checkoutSuccessView').style.display = 'none';
      $('checkoutForm').reset();
      closeBag();
    });
  }

  // Slideshow
  function showSlide(next) {
    slide = (next + slides.length) % slides.length;
    if ($('heroTrack')) $('heroTrack').style.transform = 'translateX(-' + (slide * 100) + '%)';
    dots.forEach((dot, i) => dot.setAttribute('aria-current', String(i === slide)));
    const progress = $('heroProgress');
    if (progress) {
      progress.classList.remove('run');
      void progress.offsetWidth;
      if (!reduced && !paused) progress.classList.add('run');
    }
  }

  function stopSlider() {
    clearTimeout(slideTimer);
    slideTimer = null;
    const progress = $('heroProgress');
    if (progress) progress.classList.remove('run');
  }

  function startSlider() {
    stopSlider();
    if (reduced || paused) return;
    const progress = $('heroProgress');
    if (progress) {
      progress.classList.remove('run');
      void progress.offsetWidth;
      progress.classList.add('run');
    }
    slideTimer = setTimeout(() => {
      showSlide(slide + 1);
      startSlider();
    }, 4000);
  }

  if ($('heroPrev')) $('heroPrev').addEventListener('click', () => { showSlide(slide - 1); startSlider(); });
  if ($('heroNext')) $('heroNext').addEventListener('click', () => { showSlide(slide + 1); startSlider(); });
  if ($('heroDots')) {
    $('heroDots').addEventListener('click', (e) => {
      const dot = e.target.closest('[data-slide]');
      if (!dot) return;
      showSlide(Number(dot.dataset.slide));
      startSlider();
    });
  }

  if ($('home')) {
    $('home').addEventListener('mouseenter', () => { paused = true; stopSlider(); });
    $('home').addEventListener('mouseleave', () => { paused = false; startSlider(); });
  }

  if ($('bagOpen')) $('bagOpen').addEventListener('click', openBag);
  if ($('bagClose')) $('bagClose').addEventListener('click', closeBag);
  if ($('bagBackdrop')) $('bagBackdrop').addEventListener('click', closeBag);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if ($('bagDrawer')?.classList.contains('open')) closeBag();
      if ($('quickViewDialog')?.open) $('quickViewDialog').close();
      if ($('sizeGuideDialog')?.open) $('sizeGuideDialog').close();
      if ($('checkoutDialog')?.open) $('checkoutDialog').close();
    }
  });

  if ($('checkoutOpen')) {
    $('checkoutOpen').addEventListener('click', async () => {
      if (!user) {
        toast('Please sign in to complete checkout.');
        window.location.assign('/login');
        return;
      }
      closeBag();
      await prefillCheckout();
      $('checkoutDialog').showModal();
    });
  }

  if ($('checkoutClose')) $('checkoutClose').addEventListener('click', () => $('checkoutDialog').close());
  if ($('checkoutForm')) $('checkoutForm').addEventListener('submit', checkout);

  // Category filter
  if ($('categoryTabs')) {
    $('categoryTabs').addEventListener('click', (e) => {
      const tab = e.target.closest('.filter-tab');
      if (!tab) return;
      document.querySelectorAll('.filter-tab').forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      activeCategory = tab.dataset.category;
      renderProducts();
    });
  }

  if ($('sizeFilter')) {
    $('sizeFilter').addEventListener('change', (e) => {
      activeSize = e.target.value;
      renderProducts();
    });
  }

  if ($('stockOnly')) {
    $('stockOnly').addEventListener('change', (e) => {
      stockOnly = e.target.checked;
      renderProducts();
    });
  }

  if ($('priceSort')) {
    $('priceSort').addEventListener('change', (e) => {
      activeSort = e.target.value;
      renderProducts();
    });
  }

  // Live search
  const searchInput = $('shopSearch');
  const suggestionsBox = $('searchSuggestions');
  if (searchInput && suggestionsBox) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      if (searchQuery.trim().length >= 2) {
        const matches = products.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 4);
        if (matches.length) {
          suggestionsBox.innerHTML = matches.map((m) => '<div class="suggestion-item" data-id="' + esc(m.id) + '">' + esc(m.name) + ' · ' + money(m.price) + '</div>').join('');
          suggestionsBox.classList.add('open');
        } else {
          suggestionsBox.classList.remove('open');
        }
      } else {
        suggestionsBox.classList.remove('open');
      }
      renderProducts();
    });

    suggestionsBox.addEventListener('click', (e) => {
      const item = e.target.closest('.suggestion-item');
      if (!item) return;
      openQuickView(item.dataset.id);
      suggestionsBox.classList.remove('open');
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-wrapper')) suggestionsBox.classList.remove('open');
    });
  }

  if ($('resetFilters')) $('resetFilters').addEventListener('click', resetAllFilters);

  // Lookbook links
  document.querySelectorAll('.looks-grid .look-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      e.preventDefault();
      const pid = card.dataset.product;
      if (pid) openQuickView(pid);
    });
  });

  // Wishlist header icon
  if ($('wishlistTrigger')) {
    $('wishlistTrigger').addEventListener('click', () => {
      if (!wishlist.size) {
        toast('Your wishlist is empty. Tap ♡ on any piece to save it.');
        return;
      }
      toast('You have ' + wishlist.size + ' saved pieces.');
      $('shop')?.scrollIntoView({ behavior: 'smooth' });
    });
  }

  // Mobile navigation
  const mobileToggle = $('mobileMenuToggle');
  const mobileNav = $('mobileNav');
  if (mobileToggle && mobileNav) {
    mobileToggle.addEventListener('click', () => {
      const isOpen = mobileNav.classList.toggle('open');
      mobileToggle.setAttribute('aria-expanded', String(isOpen));
    });
    mobileNav.querySelectorAll('.mobile-link').forEach((link) => {
      link.addEventListener('click', () => {
        mobileNav.classList.remove('open');
        mobileToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Newsletter form via RPC subscribe_newsletter
  if ($('newsletterForm')) {
    $('newsletterForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formEl = e.currentTarget;
      const email = $('newsletterEmail')?.value?.trim();
      const button = formEl.querySelector('button');
      if (button) button.disabled = true;
      if ($('newsletterStatus')) $('newsletterStatus').textContent = '';

      try {
        if (!email || !email.includes('@')) throw new Error('Please enter a valid email address.');
        const sb = window.getSupabase();
        const { error } = await sb.rpc('subscribe_newsletter', { p_email: email });
        if (error) throw error;
        if ($('newsletterStatus')) $('newsletterStatus').textContent = 'Welcome to the Dia atelier list.';
        formEl.reset();
      } catch (err) {
        if ($('newsletterStatus')) $('newsletterStatus').textContent = err.message || 'Could not save signup. Please try again.';
      } finally {
        if (button) button.disabled = false;
      }
    });
  }

  if ($('year')) $('year').textContent = String(new Date().getFullYear());

  // Initialization
  (async () => {
    try {
      const sb = window.diaSupabase || (typeof window.getDiaSupabase === 'function' ? window.getDiaSupabase() : window.getSupabase());
      if (sb && sb.auth) {
        const { data: { session } } = await sb.auth.getSession();
        if (session?.user) {
          user = session.user;
          const { data: profile } = await sb.from('profiles').select('*').eq('id', user.id).single();
          userProfile = profile || null;
          await mergeGuestCart(user.id);
          // Load logged in wishlist
          const { data: wishData } = await sb.from('wishlist_items').select('product_id').eq('user_id', user.id);
          if (wishData) {
            wishData.forEach((w) => wishlist.add(w.product_id));
          }
        }
      }
    } catch (e) {
      console.warn('[Dia] User session load error:', e);
    }

    updateNav();
    await Promise.all([loadProducts(), loadCart()]);

    if (user) {
      if ($('checkoutName')) $('checkoutName').value = userProfile?.name || '';
      if ($('checkoutEmail')) $('checkoutEmail').value = user.email || '';
      if ($('checkoutPhone') && userProfile?.phone) $('checkoutPhone').value = userProfile.phone;
    }
    startSlider();
  })();
})();
