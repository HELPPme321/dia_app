'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const grid = $('featuredProducts');
  const status = $('catalogStatus');
  if (!grid || !status) return;

  const dialog = $('productDialog');
  const dialogContent = $('productDialogContent');
  const bag = $('bagDrawer');
  const backdrop = $('bagBackdrop');
  const bagItems = $('bagItems');
  const bagCount = $('bagCount');
  const bagSubtotal = $('bagSubtotal');
  let products = [];
  let currentUser = null;
  let currentProduct = null;
  let selectedSize = '';
  let csrfToken = '';
  let toastTimer = null;
  let checkoutKey = '';

  const money = (value) => new Intl.NumberFormat('en-PH', {
    style: 'currency', currency: 'PHP', maximumFractionDigits: 0
  }).format(Number(value) || 0);

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
  }

  function imageFallback(image) {
    image.addEventListener('error', () => {
      if (image.dataset.fallback === 'true') return;
      image.dataset.fallback = 'true';
      image.src = '/assets/dia-editorial.webp';
    });
  }

  function showToast(message) {
    const toast = $('storeToast');
    toast.textContent = message;
    toast.hidden = false;
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toast.hidden = true; }, 2600);
  }

  async function api(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    let body = options.body;
    if (body !== undefined && typeof body !== 'string') {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      if (!csrfToken) {
        const tokenResponse = await fetch('/api/auth/csrf', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
        const tokenData = await tokenResponse.json().catch(() => ({}));
        if (!tokenResponse.ok || !tokenData.csrfToken) throw new Error('Your secure session expired. Please sign in again.');
        csrfToken = tokenData.csrfToken;
      }
      headers['X-CSRF-Token'] = csrfToken;
    }
    const response = await fetch(path, { ...options, method, body, headers, credentials: 'same-origin' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data?.error?.message || 'The store could not complete that request. Please try again.');
      error.status = response.status;
      error.code = data?.error?.code;
      if (error.code === 'CSRF_VALIDATION_FAILED') csrfToken = '';
      throw error;
    }
    if (data.csrfToken) csrfToken = data.csrfToken;
    return data;
  }

  function requireAccount() {
    if (currentUser?.status === 'active' && currentUser.role === 'user') return true;
    window.location.assign('/login');
    return false;
  }

  function updateNavigation() {
    const signIn = $('signInLink');
    const account = $('myAccountLink');
    const signOut = $('signOutButton');
    if (currentUser?.status === 'active') {
      signIn.hidden = true;
      account.hidden = false;
      account.href = currentUser.role === 'admin' ? '/admin' : '/dashboard';
      account.textContent = currentUser.role === 'admin' ? 'Admin studio' : 'My account';
      signOut.hidden = false;
    } else {
      signIn.hidden = false;
      account.hidden = true;
      signOut.hidden = true;
    }
  }

  function productCard(product, index) {
    const image = product.image || '/assets/dia-editorial.webp';
    const tag = product.tag || 'Dia selection';
    const secondary = typeof product.secondaryImage === 'string' && (product.secondaryImage.startsWith('https://') || product.secondaryImage.startsWith('/assets/')) ? '<img class="product-secondary-image" src="' + escapeHtml(product.secondaryImage) + '" alt="" loading="lazy" decoding="async">' : '';
    const visualClass = secondary ? 'product-visual has-secondary' : 'product-visual';
    const stock = Number(product.stock) > 0 ? 'Available now' : 'Currently unavailable';
    return `
      <article class="product-card" style="--card-index:${index}">
        <button class="${visualClass}" type="button" data-action="view-product" data-product-id="${escapeHtml(product.id)}" aria-label="View ${escapeHtml(product.name)}">
          <img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)} — ${escapeHtml(product.color || product.category)}" loading="lazy" decoding="async" style="object-position:${escapeHtml(product.position || 'center center')}">
          ${secondary}
          <span class="product-tag">${escapeHtml(tag)}</span>
          <span class="product-view">Discover piece <b>↗</b></span>
        </button>
        <div class="product-card-copy">
          <div><p class="product-category">${escapeHtml(product.category)}</p><h3>${escapeHtml(product.name)}</h3><span class="product-stock">${stock}</span></div>
          <strong>${money(product.price)}</strong>
        </div>
      </article>`;
  }

  function renderProducts() {
    if (!products.length) {
      grid.innerHTML = '';
      status.textContent = 'The collection is being refreshed. Please check back soon.';
      return;
    }
    status.textContent = products.length + (products.length === 1 ? ' considered piece' : ' considered pieces') + ' in the current edit';
    grid.innerHTML = products.map(productCard).join('');
    grid.querySelectorAll('img').forEach(imageFallback);
  }

  function openProduct(id) {
    const product = products.find((item) => item.id === id);
    if (!product) return;
    currentProduct = product;
    selectedSize = '';
    const sizes = Array.isArray(product.sizes) ? product.sizes : [];
    const available = Number(product.stock) > 0;
    dialogContent.innerHTML = `
      <div class="quick-view">
        <div class="quick-view-image"><img id="quickViewImage" src="${escapeHtml(product.image || '/assets/dia-editorial.webp')}" alt="${escapeHtml(product.name)}" style="object-position:${escapeHtml(product.position || 'center center')}"></div>
        <div class="quick-view-copy">
          <p class="eyebrow">${escapeHtml(product.tag || 'THE DIA EDIT')} · ${escapeHtml(product.category)}</p>
          <h2 id="productDialogTitle">${escapeHtml(product.name)}</h2>
          <strong class="quick-view-price">${money(product.price)}</strong>
          <p>${escapeHtml(product.description || 'A considered Dia essential, chosen for comfort and everyday expression.')}</p>
          <div class="quick-view-meta"><span>Color</span><b>${escapeHtml(product.color || 'Dia selection')}</b></div>
          <p class="size-label">Choose your size</p>
          <div class="size-picker" role="group" aria-label="Available sizes">${sizes.map((size) => `<button type="button" class="size-choice" data-action="select-size" data-size="${escapeHtml(size)}" aria-pressed="false">${escapeHtml(size)}</button>`).join('')}</div>
          <p class="quick-view-error" id="quickViewError" role="status"></p>
          <button class="gold-button quick-add" type="button" data-action="add-to-bag" ${available ? '' : 'disabled'}>${available ? 'Add to bag' : 'Currently unavailable'} <span aria-hidden="true">↗</span></button>
        </div>
      </div>`;
    imageFallback($('quickViewImage'));
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function setBagOpen(open) {
    bag.hidden = !open;
    backdrop.hidden = !open;
    bag.setAttribute('aria-hidden', String(!open));
    $('bagToggle').setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('bag-open', open);
    if (open) $('bagClose').focus();
  }

  async function refreshBag() {
    const data = await api('/api/cart');
    const items = Array.isArray(data.items) ? data.items : [];
    bagCount.textContent = String(data.summary?.itemCount || 0);
    bagSubtotal.textContent = money(data.summary?.subtotal || 0);
    $('checkoutOpen').disabled = items.length === 0;
    if (!items.length) {
      bagItems.innerHTML = '<p class="bag-empty">Your bag is waiting for something lovely.</p>';
      return;
    }
    bagItems.innerHTML = items.map((item) => `
      <article class="bag-item">
        <img src="${escapeHtml(item.image || '/assets/dia-editorial.webp')}" alt="" loading="lazy">
        <div class="bag-item-copy"><span>${escapeHtml(item.category)}</span><strong>${escapeHtml(item.name)}</strong><small>Size ${escapeHtml(item.size)} · ${money(item.price)}</small>
          <div class="bag-item-actions"><button type="button" data-action="bag-qty" data-product-id="${escapeHtml(item.productId)}" data-size="${escapeHtml(item.size)}" data-quantity="${Number(item.quantity)}" data-delta="-1" aria-label="Decrease quantity">−</button><b>${Number(item.quantity)}</b><button type="button" data-action="bag-qty" data-product-id="${escapeHtml(item.productId)}" data-size="${escapeHtml(item.size)}" data-quantity="${Number(item.quantity)}" data-delta="1" aria-label="Increase quantity">+</button><button class="bag-remove" type="button" data-action="bag-remove" data-product-id="${escapeHtml(item.productId)}" data-size="${escapeHtml(item.size)}">Remove</button></div>
        </div>
        <strong class="bag-line-total">${money(Number(item.price) * Number(item.quantity))}</strong>
      </article>`).join('');
    bagItems.querySelectorAll('img').forEach(imageFallback);
  }

  async function openBag() {
    if (!requireAccount()) return;
    try {
      await refreshBag();
      setBagOpen(true);
    } catch (error) {
      showToast(error.message);
      if (error.status === 401) window.location.assign('/login');
    }
  }

  async function addToBag() {
    if (!currentProduct || !requireAccount()) return;
    if (!selectedSize) {
      $('quickViewError').textContent = 'Choose a size to continue.';
      return;
    }
    try {
      await api('/api/cart/items', { method: 'POST', body: { productId: currentProduct.id, size: selectedSize, quantity: 1 } });
      dialog.close();
      showToast(currentProduct.name + ' added to your bag.');
      await refreshBag();
      setBagOpen(true);
    } catch (error) {
      $('quickViewError').textContent = error.message;
      if (error.status === 401) window.location.assign('/login');
    }
  }

  async function changeBagQuantity(button) {
    if (!requireAccount()) return;
    const quantity = Number(button.dataset.quantity) + Number(button.dataset.delta);
    try {
      await api('/api/cart/items', {
        method: quantity <= 0 ? 'DELETE' : 'PUT',
        body: { productId: button.dataset.productId, size: button.dataset.size, ...(quantity > 0 ? { quantity } : {}) }
      });
      await refreshBag();
    } catch (error) {
      showToast(error.message);
      if (error.status === 401) window.location.assign('/login');
    }
  }

  async function removeBagItem(button) {
    if (!requireAccount()) return;
    try {
      await api('/api/cart/items', { method: 'DELETE', body: { productId: button.dataset.productId, size: button.dataset.size } });
      await refreshBag();
    } catch (error) {
      showToast(error.message);
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    switch (button.dataset.action) {
      case 'view-product': openProduct(button.dataset.productId); break;
      case 'select-size':
        selectedSize = button.dataset.size || '';
        dialogContent.querySelectorAll('.size-choice').forEach((choice) => {
          const active = choice.dataset.size === selectedSize;
          choice.classList.toggle('is-selected', active);
          choice.setAttribute('aria-pressed', String(active));
        });
        $('quickViewError').textContent = '';
        break;
      case 'add-to-bag': addToBag(); break;
      case 'close-product': dialog.close(); break;
      case 'bag-qty': changeBagQuantity(button); break;
      case 'bag-remove': removeBagItem(button); break;
    }
  });


  $('checkoutOpen').addEventListener('click', () => {
    if (!requireAccount()) return;
    const form = $('checkoutForm');
    form.reset();
    $('checkoutName').value = currentUser?.name || '';
    $('checkoutEmail').value = currentUser?.email || '';
    $('checkoutError').textContent = '';
    $('checkoutError').classList.remove('checkout-notice-success');
    $('checkoutSubmit').disabled = false;
    checkoutKey = window.crypto?.randomUUID?.() || ('dia-' + Date.now() + '-' + Math.random().toString(16).slice(2));
    setBagOpen(false);
    $('checkoutDialog').showModal();
  });
  $('checkoutClose').addEventListener('click', () => $('checkoutDialog').close());
  $('checkoutForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!requireAccount()) return;
    const submit = $('checkoutSubmit');
    submit.disabled = true;
    $('checkoutError').textContent = '';
    try {
      const result = await api('/api/orders', {
        method: 'POST',
        body: {
          customerName: $('checkoutName').value.trim(),
          customerEmail: $('checkoutEmail').value.trim(),
          customerAddress: $('checkoutAddress').value.trim(),
          idempotencyKey: checkoutKey
        }
      });
      await refreshBag();
      const orderNumber = result.order?.orderNumber || 'your Dia order';
      $('checkoutError').textContent = 'Order ' + orderNumber + ' saved to your account. This is a demo order; no payment was collected.';
      $('checkoutError').classList.add('checkout-notice-success');
      $('checkoutSubmit').disabled = true;
      $('checkoutForm').reset();
      showToast('Your demo order has been saved.');
    } catch (error) {
      $('checkoutError').textContent = error.message;
      if (error.status === 401) window.location.assign('/login');
    } finally {
      if ($('checkoutSubmit')) $('checkoutSubmit').disabled = false;
    }
  });

  $('bagToggle').addEventListener('click', () => {
    if (bag.hidden) openBag();
    else setBagOpen(false);
  });
  $('bagClose').addEventListener('click', () => setBagOpen(false));
  backdrop.addEventListener('click', () => setBagOpen(false));
  $('signOutButton').addEventListener('click', async () => {
    const button = $('signOutButton');
    button.disabled = true;
    try {
      await api('/api/auth/logout', { method: 'POST', body: {} });
      window.location.replace('/login?loggedOut=1');
    } catch (error) {
      showToast(error.message);
      button.disabled = false;
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !bag.hidden) setBagOpen(false);
  });

  async function initialize() {
    $('year').textContent = String(new Date().getFullYear());
    document.querySelectorAll('img').forEach(imageFallback);
    const [catalog, auth] = await Promise.allSettled([
      fetch('/api/products', { headers: { Accept: 'application/json' } }).then((response) => {
        if (!response.ok) throw new Error('The collection could not be loaded.');
        return response.json();
      }),
      api('/api/auth/me')
    ]);
    if (catalog.status === 'fulfilled') {
      products = Array.isArray(catalog.value.products) ? catalog.value.products : [];
      renderProducts();
    } else {
      status.textContent = catalog.reason?.message || 'The collection could not be loaded. Refresh to try again.';
    }
    if (auth.status === 'fulfilled' && auth.value.authenticated) {
      currentUser = auth.value.user || null;
      updateNavigation();
      if (currentUser?.role === 'user') {
        try { await refreshBag(); } catch { bagCount.textContent = '0'; }
      }
    } else {
      currentUser = null;
      updateNavigation();
      bagCount.textContent = '0';
    }
  }

  initialize().catch(() => {
    status.textContent = 'Dia is taking a moment. Refresh the page to try again.';
  });
})();