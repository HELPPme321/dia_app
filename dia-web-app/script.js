/* Dia+ storefront demo — vanilla JavaScript only. Cart and saved items persist in localStorage. */
(() => {
  "use strict";

  const STORAGE_KEYS = { cart: "dia-plus-cart-v1", saved: "dia-plus-saved-v1" };
  let PRODUCTS = [];
  let productsLoaded = false;
  let productsError = '';
  let storeCsrf = '';
  let checkoutAttemptId = '';
  let sortMode = 'featured';
  let priceRange = 'all';
  let legacyCartMigrated = false;
  let orderHistory = [];
  let ordersLoading = false;
  let ordersError = '';

  const appScreen = document.getElementById("appScreen");
  const homeView = document.getElementById("homeView");
  const storeView = document.getElementById("storeView");
  const pageContent = document.getElementById("pageContent");
  const productModal = document.getElementById("productModal");
  const productModalContent = document.getElementById("productModalContent");
  const checkoutModal = document.getElementById("checkoutModal");
  const checkoutContent = document.getElementById("checkoutContent");
  const toast = document.getElementById("toast");
  const headerBagCount = document.getElementById("headerBagCount");
  const navBagCount = document.getElementById("navBagCount");

  let currentPage = "home";
  let activeCategory = "All";
  let searchQuery = "";
  let activeProductId = null;
  let selectedSize = "";
  let toastTimeout = null;
  let cart = [];
  let saved = readStorage(STORAGE_KEYS.saved, []);
  let legacyCart = readStorage(STORAGE_KEYS.cart, []);

  function readStorage(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value ?? fallback;
    } catch (error) {
      console.warn(`Could not read ${key} from localStorage.`, error);
      return fallback;
    }
  }

  function saveStorage() {
    try {
      localStorage.setItem(STORAGE_KEYS.saved, JSON.stringify(saved));
    } catch (error) {
      console.warn("Storage is unavailable. Saved items will last for this session only.", error);
    }
  }

  function apiFailureMessage(response, data, method, url, fallback) {
    const requestPath = (() => {
      try { return new URL(url, window.location.href).pathname; }
      catch { return String(url).split('?')[0]; }
    })();
    const contentType = response.headers.get('content-type') || 'unknown content type';
    if (response.status === 404) {
      const apiError = data?.error;
      if (apiError?.code === 'ENDPOINT_NOT_FOUND') {
        const build = apiError.version
          ? `; ${apiError.service || 'Dia+'} v${apiError.version}${apiError.buildCommit ? ' (' + String(apiError.buildCommit).slice(0, 7) + ')' : ''}`
          : '; server build unknown';
        return `${apiError.message || 'API endpoint not found.'} [${apiError.method || method} ${apiError.path || requestPath}${build}]`;
      }
      const serverMessage = apiError?.message || data?.message;
      if (serverMessage) return `${serverMessage} [${method} ${requestPath}; HTTP 404; ${contentType}]`;
      return `API endpoint request failed: ${method} ${requestPath} returned HTTP 404 (${contentType}). Verify this page is served by the current Dia+ Express app, not a static host or stale deployment.`;
    }
    return data?.error?.message || data?.message || fallback;
  }

  async function getStoreCsrf() {
    const response = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.csrfToken) throw new Error(apiFailureMessage(response, data, 'GET', '/api/auth/csrf', 'Could not start a secure store session. Refresh and try again.'));
    storeCsrf = data.csrfToken;
    return storeCsrf;
  }

  async function storeApi(url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    if (options.body) headers['Content-Type'] = 'application/json';
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      if (!storeCsrf) await getStoreCsrf();
      headers['X-CSRF-Token'] = storeCsrf;
    }
    const response = await fetch(url, { ...options, method, headers, credentials: 'same-origin' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(apiFailureMessage(response, data, method, url, 'The store request failed. Please try again.'));
      error.status = response.status;
      error.code = data?.error?.code;
      throw error;
    }
    if (data.csrfToken) storeCsrf = data.csrfToken;
    return data;
  }

  async function loadProducts() {
    try {
      const params = new URLSearchParams({ sort: sortMode });
      const response = await fetch('/api/products?' + params.toString(), { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apiFailureMessage(response, data, 'GET', '/api/products', 'Could not load the clothing catalog.'));
      PRODUCTS = Array.isArray(data.products) ? data.products : [];
      productsError = '';
      productsLoaded = true;
      if (currentPage !== 'home') renderPage();
      return PRODUCTS;
    } catch (error) {
      productsError = error.message || 'Could not load the clothing catalog.';
      productsLoaded = true;
      if (currentPage !== 'home') renderPage();
      throw error;
    }
  }

  async function refreshCart() {
    const data = await storeApi('/api/cart');
    cart = Array.isArray(data.items) ? data.items.map((item) => ({
      productId: item.productId, size: item.size, quantity: item.quantity
    })) : [];
    updateCartBadges();
    return cart;
  }

  async function loadOrders() {
    ordersLoading = true;
    ordersError = '';
    if (currentPage === 'orders') renderPage();
    try {
      const data = await storeApi('/api/orders');
      orderHistory = Array.isArray(data.orders) ? data.orders : [];
    } catch (error) {
      ordersError = error.message || 'Could not load order history.';
    } finally {
      ordersLoading = false;
      if (currentPage === 'orders') renderPage();
    }
  }

  async function migrateLegacyCart() {
    if (legacyCartMigrated) return;
    const legacy = Array.isArray(legacyCart) ? legacyCart : [];
    try {
      await refreshCart();
      let changed = false;
      for (const oldItem of legacy) {
        const product = productById(oldItem?.productId);
        const quantity = Number(oldItem?.quantity);
        if (!product || !product.sizes.includes(oldItem?.size) || !Number.isSafeInteger(quantity) || quantity < 1) continue;
        const existing = cart.find((item) => item.productId === product.id && item.size === oldItem.size);
        const nextQuantity = Math.min(product.stock, (existing?.quantity || 0) + quantity);
        if (nextQuantity < 1) continue;
        if (existing) {
          await storeApi('/api/cart/items', { method: 'PUT', body: JSON.stringify({ productId: product.id, size: oldItem.size, quantity: nextQuantity }) });
        } else {
          await storeApi('/api/cart/items', { method: 'POST', body: JSON.stringify({ productId: product.id, size: oldItem.size, quantity: nextQuantity }) });
        }
        changed = true;
        await refreshCart();
      }
      localStorage.removeItem(STORAGE_KEYS.cart);
      legacyCartMigrated = true;
      if (changed) await refreshCart();
    } catch (error) {
      console.warn('Existing browser cart could not be fully migrated; it remains saved locally.', error);
    }
  }

  document.addEventListener('dia:auth-success', async () => {
    try {
      await loadProducts();
      await migrateLegacyCart();
      await refreshCart();
      navigate('shop');
    } catch (error) {
      showToast(error.message || 'The store is temporarily unavailable.');
      navigate('shop');
    }
  });
  document.addEventListener('dia:auth-logout', () => {
    storeCsrf = '';
    cart = [];
    orderHistory = [];
    updateCartBadges();
    openHome();
  });

  function formatPrice(value) {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0
    }).format(value);
  }

  function icon(name, extraClass = "") {
    const paths = {
      search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/>',
      heart: '<path d="M20.8 8.8c0 5-8.8 11-8.8 11s-8.8-6-8.8-11A4.7 4.7 0 0 1 12 6.3a4.7 4.7 0 0 1 8.8 2.5Z"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      minus: '<path d="M5 12h14"/>',
      trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"/>',
      bag: '<path d="M5 8h14l1 12H4L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/>',
      truck: '<path d="M3 6h11v11H3zM14 10h4l3 3v4h-7"/><circle cx="7.5" cy="18" r="1.5"/><circle cx="17.5" cy="18" r="1.5"/>',
      sparkle: '<path d="m12 2 1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2Z"/>',
      check: '<path d="m5 12 4 4L19 6"/>',
      arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>'
    };
    return `<svg class="${extraClass}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.sparkle}</svg>`;
  }

  function productById(id) {
    return PRODUCTS.find((product) => product.id === id);
  }

  function cartCount() {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }

  function cartSubtotal() {
    return cart.reduce((sum, item) => {
      const product = productById(item.productId);
      return sum + (product ? product.price * item.quantity : 0);
    }, 0);
  }

  function updateCartBadges() {
    const count = cartCount();
    [headerBagCount, navBagCount].forEach((badge) => {
      badge.textContent = count > 99 ? "99+" : String(count);
      badge.classList.toggle("has-items", count > 0);
    });
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimeout);
    toastTimeout = window.setTimeout(() => toast.classList.remove("is-visible"), 2300);
  }

  function openHome() {
    closeOverlays();
    currentPage = "home";
    homeView.hidden = false;
    homeView.classList.add("is-active");
    storeView.hidden = true;
    storeView.classList.remove("is-active");
  }

  function navigate(page) {
    closeOverlays();
    if (page === "home") {
      openHome();
      return;
    }
    currentPage = ["shop", "saved", "bag", "orders"].includes(page) ? page : "shop";
    homeView.hidden = true;
    homeView.classList.remove("is-active");
    storeView.hidden = false;
    storeView.classList.add("is-active");
    renderPage();
    if (currentPage === 'orders') loadOrders();
  }

  function closeOverlays() {
    productModal.hidden = true;
    checkoutModal.hidden = true;
    activeProductId = null;
    selectedSize = "";
  }

  function pageHeader() {
    if (currentPage === "saved") {
      return `<div class="page-heading"><p class="page-kicker">YOUR SHORTLIST</p><h1 class="page-title">Saved pieces.</h1><p class="page-subtitle">The ones that feel like you. Keep your favorites close.</p></div>`;
    }
    if (currentPage === "bag") {
      return `<div class="page-heading"><p class="page-kicker">A GOOD CHOICE</p><h1 class="page-title">Your bag.</h1><p class="page-subtitle">A few considered essentials, picked just for you.</p></div>`;
    }
    if (currentPage === "orders") {
      return `<div class="page-heading"><p class="page-kicker">YOUR DIA+ ACCOUNT</p><h1 class="page-title">Your orders.</h1><p class="page-subtitle">A record of orders placed through this account. Demo orders do not collect payment.</p></div>`;
    }
    return `<div class="page-heading"><p class="page-kicker">THE DIA EDIT · DROP Nº 01</p><h1 class="page-title">Find your form.</h1><p class="page-subtitle">Everyday essentials. Quietly different, made to be worn your way.</p></div>`;
  }

  function productCard(product) {
    const isSaved = saved.includes(product.id);
    const name = escapeHtml(product.name);
    const color = escapeHtml(product.color);
    const category = escapeHtml(product.category);
    const image = escapeHtml(product.image || '/assets/dia-editorial.webp');
    const position = escapeHtml(product.position || 'center center');
    const tag = escapeHtml(product.tag || 'Everyday essential');
    const unavailable = Number(product.stock) <= 0;
    return `
      <article class="product-card" data-product-card="${escapeHtml(product.id)}">
        <div class="product-image-wrap" role="button" tabindex="0" data-action="open-product" data-product-id="${escapeHtml(product.id)}" aria-label="View ${name} details">
          <img class="product-image" src="${image}" alt="${name} in ${color}" loading="lazy" style="object-position:${position}" />
          <span class="product-tag">${unavailable ? 'Out of stock' : tag}</span>
          <button class="heart-button ${isSaved ? "is-saved" : ""}" data-action="toggle-saved" data-product-id="${escapeHtml(product.id)}" aria-label="${isSaved ? "Remove from" : "Add to"} saved items" aria-pressed="${isSaved}">${icon("heart")}</button>
        </div>
        <div class="product-meta">
          <h3 class="product-name" role="button" tabindex="0" data-action="open-product" data-product-id="${escapeHtml(product.id)}">${name}</h3>
          <p class="product-price">${formatPrice(product.price)}</p>
        </div>
        <p class="product-category">${color} · ${category}</p>
        <button class="quick-add" data-action="open-product" data-product-id="${escapeHtml(product.id)}">Quick view ${icon("arrow")}</button>
      </article>`;
  }

    function getVisibleProducts() {
    let list = [...PRODUCTS];
    if (currentPage === "saved") list = list.filter((product) => saved.includes(product.id));
    if (activeCategory !== "All" && currentPage === "shop") list = list.filter((product) => product.category === activeCategory);
    const query = searchQuery.trim().toLowerCase();
    if (query) list = list.filter((product) => `${product.name} ${product.category} ${product.color} ${product.tag} ${product.description}`.toLowerCase().includes(query));
    if (priceRange === 'under-1000') list = list.filter((product) => product.price < 1000);
    if (priceRange === '1000-2000') list = list.filter((product) => product.price >= 1000 && product.price <= 2000);
    if (priceRange === 'over-2000') list = list.filter((product) => product.price > 2000);
    if (sortMode === 'price-asc') list.sort((a,b) => a.price-b.price);
    else if (sortMode === 'price-desc') list.sort((a,b) => b.price-a.price);
    else if (sortMode === 'newest') list.sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    else list.sort((a,b) => String(a.tag || '').localeCompare(String(b.tag || '')));
    return list;
  }

    function renderGrid() {
    if (!productsLoaded) return `<div class="empty-state"><h3>Loading the collection…</h3><p>Getting the current catalog from Dia+.</p></div>`;
    if (productsError && PRODUCTS.length === 0) return `<div class="empty-state"><h3>The collection could not be loaded.</h3><p>${escapeHtml(productsError)}</p><button class="secondary-button" data-action="retry-products">Try again</button></div>`;
    const products = getVisibleProducts();
    const title = currentPage === "saved" ? "Your favorites" : "The collection";
    const countText = `${products.length} ${products.length === 1 ? "piece" : "pieces"}`;
    if (!products.length) {
      const isSavedEmpty = currentPage === "saved" && !searchQuery.trim();
      const emptyMessage = currentPage === "saved"
        ? "Tap the little heart on anything that feels like you."
        : (PRODUCTS.length ? "Try another search, price range, or category." : "The catalog is empty. An administrator can add products or run the documented sample-catalog seed.");
      return `<div class="empty-state">${icon(isSavedEmpty ? "heart" : "search")}<h3>${isSavedEmpty ? "Nothing saved just yet." : (PRODUCTS.length ? "No pieces found." : "The collection is waiting for products.")}</h3><p>${emptyMessage}</p>${isSavedEmpty ? '<button class="primary-button" data-action="navigate" data-page="shop">Explore the collection</button>' : '<button class="secondary-button" data-action="clear-filters">Clear filters</button>'}</div>`;
    }
    return `<div class="section-label-row"><h2 class="section-label">${title}</h2><span class="section-count">${countText}</span></div><div class="product-grid">${products.map(productCard).join("")}</div>`;
  }

    function renderShop() {
    const categories = ["All", ...new Set(PRODUCTS.map((product) => product.category).filter(Boolean))];
    return `${pageHeader()}
      <label class="search-box">${icon("search")}<input type="search" id="productSearch" autocomplete="off" value="${escapeHtml(searchQuery)}" placeholder="Search your next favorite..." aria-label="Search products" /></label>
      <div class="filter-row" role="group" aria-label="Filter products by category">
        ${categories.map((category) => `<button class="filter-chip ${activeCategory === category ? "is-active" : ""}" data-action="filter-category" data-category="${escapeHtml(category)}" aria-pressed="${activeCategory === category}">${escapeHtml(category)}</button>`).join("")}
      </div>
      <div class="store-selectors"><label for="productSort">Sort <select id="productSort"><option value="featured" ${sortMode === 'featured' ? 'selected' : ''}>Featured</option><option value="price-asc" ${sortMode === 'price-asc' ? 'selected' : ''}>Price: low to high</option><option value="price-desc" ${sortMode === 'price-desc' ? 'selected' : ''}>Price: high to low</option><option value="newest" ${sortMode === 'newest' ? 'selected' : ''}>Newest</option></select></label>
        <label for="priceRange">Price <select id="priceRange"><option value="all" ${priceRange === 'all' ? 'selected' : ''}>Any price</option><option value="under-1000" ${priceRange === 'under-1000' ? 'selected' : ''}>Under ₱1,000</option><option value="1000-2000" ${priceRange === '1000-2000' ? 'selected' : ''}>₱1,000–₱2,000</option><option value="over-2000" ${priceRange === 'over-2000' ? 'selected' : ''}>Over ₱2,000</option></select></label></div>
      <div id="productGridArea">${renderGrid()}</div>
      <p class="shipping-note">${icon("truck")} Thoughtful pieces, delivered with care. Free shipping on orders over ₱2,500.</p>`;
  }

    function renderSaved() {
    return `${pageHeader()}
      <label class="search-box">${icon("search")}<input type="search" id="productSearch" autocomplete="off" value="${escapeHtml(searchQuery)}" placeholder="Search saved pieces..." aria-label="Search saved products" /></label>
      <div style="height:16px"></div><div id="productGridArea">${renderGrid()}</div>`;
  }

  function renderBag() {
    if (!cart.length) {
      return `${pageHeader()}<div class="empty-state">${icon("bag")}<h3>Your bag is taking a breather.</h3><p>Good things are worth finding. Explore the collection and start with one piece you love.</p><button class="primary-button" data-action="navigate" data-page="shop">Explore the collection ${icon("arrow")}</button></div>`;
    }
    const items = cart.map((item) => {
      const product = productById(item.productId);
      if (!product) return "";
      return `<article class="bag-item">
        <img class="bag-item-image" src="${escapeHtml(product.image || '/assets/dia-editorial.webp')}" alt="${escapeHtml(product.name)}" style="object-position:${escapeHtml(product.position || 'center center')}" />
        <div class="bag-item-info">
          <div class="bag-item-top"><div><h3 class="bag-item-name">${escapeHtml(product.name)}</h3><p class="bag-item-size">${escapeHtml(product.color)} · ${escapeHtml(item.size)}</p><p class="product-category">Available stock: ${product.stock}</p></div><button class="remove-item" data-action="remove-item" data-product-id="${escapeHtml(product.id)}" data-size="${escapeHtml(item.size)}" aria-label="Remove ${escapeHtml(product.name)}">${icon("trash")}</button></div>
          <div class="bag-item-bottom"><div class="quantity-control" aria-label="Quantity controls"><button data-action="change-quantity" data-delta="-1" data-product-id="${escapeHtml(product.id)}" data-size="${escapeHtml(item.size)}" aria-label="Decrease quantity">−</button><span>${item.quantity}</span><button data-action="change-quantity" data-delta="1" data-product-id="${escapeHtml(product.id)}" data-size="${escapeHtml(item.size)}" aria-label="Increase quantity" ${item.quantity >= product.stock ? 'disabled' : ''}>+</button></div><p class="bag-item-price">${formatPrice(product.price * item.quantity)}</p></div>
        </div>
      </article>`;
    }).join("");
    const subtotal = cartSubtotal();
    const shipping = subtotal >= 2500 ? 0 : 120;
    const total = subtotal + shipping;
    return `${pageHeader()}<div class="bag-list">${items}</div>
      <div class="order-summary"><p class="summary-line"><span>Subtotal</span><strong>${formatPrice(subtotal)}</strong></p><p class="summary-line"><span>Shipping</span><strong>${shipping === 0 ? "Free" : formatPrice(shipping)}</strong></p><p class="summary-line total"><span>Total</span><strong>${formatPrice(total)}</strong></p></div>
      <p class="shipping-note">${icon("truck")} ${shipping === 0 ? "You've unlocked complimentary shipping." : `Add ${formatPrice(2500 - subtotal)} more for free shipping.`}</p>
      <p class="product-category">Checkout creates a pending demonstration order. No payment will be collected.</p>
      <div class="bag-actions"><button class="primary-button full-width" data-action="checkout">Continue to checkout ${icon("arrow")}</button><button class="secondary-button full-width" data-action="navigate" data-page="shop">Continue shopping</button></div>`;
  }

  function renderOrders() {
    if (ordersLoading) return `${pageHeader()}<div class="empty-state"><h3>Loading your orders…</h3></div>`;
    if (ordersError) return `${pageHeader()}<div class="empty-state"><h3>Order history could not be loaded.</h3><p>${escapeHtml(ordersError)}</p><button class="secondary-button" data-action="retry-orders">Try again</button></div>`;
    if (!orderHistory.length) return `${pageHeader()}<div class="empty-state"><h3>No orders yet.</h3><p>Orders you place through checkout will appear here.</p><button class="primary-button" data-action="navigate" data-page="shop">Explore the collection</button></div>`;
    return `${pageHeader()}<div class="order-history">${orderHistory.map((order) => `<article class="order-history-card"><div class="order-history-top"><strong>${escapeHtml(order.orderNumber)}</strong><span class="admin-status">${escapeHtml(order.status)}</span></div><p>${new Date(order.createdAt).toLocaleString()} · ${order.items.reduce((sum, item) => sum + item.quantity, 0)} item(s)</p><ul>${order.items.map((item) => `<li>${escapeHtml(item.name)} · ${escapeHtml(item.size)} × ${item.quantity} — ${formatPrice(item.lineTotal)}</li>`).join('')}</ul><strong class="order-history-total">${formatPrice(order.total)}</strong><p class="product-category">Payment: ${escapeHtml(order.paymentStatus)}. Demo orders do not collect payment.</p></article>`).join('')}</div>`;
  }

    function renderPage() {
    updateCartBadges();
    document.querySelectorAll(".nav-item").forEach((button) => {
      button.classList.toggle("is-current", button.dataset.page === currentPage);
      if (button.dataset.page === currentPage) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    if (currentPage === "bag") pageContent.innerHTML = renderBag();
    else if (currentPage === "saved") pageContent.innerHTML = renderSaved();
    else if (currentPage === "orders") pageContent.innerHTML = renderOrders();
    else pageContent.innerHTML = renderShop();
    pageContent.scrollTop = 0;
  }

  function openProduct(id) {
    const product = productById(id);
    if (!product) return;
    activeProductId = id;
    selectedSize = "";
    const isSaved = saved.includes(id);
    const sizes = Array.isArray(product.sizes) ? product.sizes : [];
    const outOfStock = Number(product.stock) <= 0;
    productModalContent.innerHTML = `
      <div class="detail-image-wrap"><img class="detail-image" src="${escapeHtml(product.image || '/assets/dia-editorial.webp')}" alt="${escapeHtml(product.name)} in ${escapeHtml(product.color)}" style="object-position:${escapeHtml(product.position || 'center center')}" /></div>
      <div class="detail-copy">
        <p class="page-kicker">${escapeHtml(product.tag || 'Everyday essential')} · ${escapeHtml(product.category)}</p>
        <div class="detail-title-row"><h2 class="detail-name" id="detailName">${escapeHtml(product.name)}</h2><p class="detail-price">${formatPrice(product.price)}</p></div>
        <p class="detail-description">${escapeHtml(product.description)}</p>
        <p class="option-title"><span>Choose your size</span><span class="option-hint">Color: ${escapeHtml(product.color)}</span></p>
        <div class="size-options" role="group" aria-label="Choose a size">${sizes.map((size) => `<button class="size-option" data-action="select-size" data-size="${escapeHtml(size)}" aria-pressed="false">${escapeHtml(size)}</button>`).join("")}</div>
        <p class="product-category">${outOfStock ? 'Currently out of stock' : Number(product.stock) + ' available'}</p>
        <p class="form-error" id="sizeError" aria-live="polite"></p>
        <div class="detail-actions"><button class="icon-button detail-heart ${isSaved ? "is-saved" : ""}" data-action="toggle-saved-detail" data-product-id="${escapeHtml(product.id)}" aria-label="${isSaved ? "Remove from saved items" : "Save item"}" aria-pressed="${isSaved}">${icon("heart")}</button><button class="primary-button" data-action="add-to-bag" data-product-id="${escapeHtml(product.id)}" ${outOfStock ? 'disabled' : ''}>${outOfStock ? 'Out of stock' : 'Add to bag · ' + formatPrice(product.price)}</button></div>
      </div>`;
    productModal.hidden = false;
    productModal.querySelector(".modal-panel").scrollTop = 0;
  }

    function toggleSaved(id) {
    const product = productById(id);
    if (!product) return;
    if (saved.includes(id)) {
      saved = saved.filter((itemId) => itemId !== id);
      showToast(`${product.name} removed from saved items`);
    } else {
      saved.push(id);
      showToast(`${product.name} saved for later`);
    }
    saveStorage();
    if (productModal.hidden) renderPage();
    else if (activeProductId === id) openProduct(id);
  }

  async function addToCart(productId, size) {
    const product = productById(productId);
    if (!product || !size) return;
    try {
      await storeApi('/api/cart/items', { method: 'POST', body: JSON.stringify({ productId, size, quantity: 1 }) });
      await refreshCart();
      productModal.hidden = true;
      activeProductId = null;
      showToast(`${product.name} added to your bag`);
      if (currentPage === "bag") renderPage();
    } catch (error) {
      showToast(error.message || 'That item could not be added.');
    }
  }

  async function changeQuantity(productId, size, delta) {
    const item = cart.find((entry) => entry.productId === productId && entry.size === size);
    if (!item) return;
    const quantity = item.quantity + delta;
    try {
      if (quantity <= 0) {
        await storeApi('/api/cart/items', { method: 'DELETE', body: JSON.stringify({ productId, size }) });
      } else {
        await storeApi('/api/cart/items', { method: 'PUT', body: JSON.stringify({ productId, size, quantity }) });
      }
      await refreshCart();
      renderPage();
    } catch (error) {
      showToast(error.message || 'Bag quantity could not be updated.');
    }
  }

  async function removeItem(productId, size) {
    const product = productById(productId);
    try {
      await storeApi('/api/cart/items', { method: 'DELETE', body: JSON.stringify({ productId, size }) });
      await refreshCart();
      renderPage();
      if (product) showToast(`${product.name} removed from your bag`);
    } catch (error) {
      showToast(error.message || 'The bag item could not be removed.');
    }
  }

    function updateProductGrid() {
    const area = document.getElementById("productGridArea");
    if (area) area.innerHTML = renderGrid();
  }

  function openCheckout() {
    if (!cart.length) {
      showToast("Your bag is empty");
      return;
    }
    checkoutAttemptId = (window.crypto && typeof window.crypto.randomUUID === 'function')
      ? window.crypto.randomUUID() : 'dia-' + Date.now() + '-' + Math.random().toString(16).slice(2);
    checkoutContent.innerHTML = `
      <p class="checkout-intro">Almost yours</p><h2 class="checkout-title" id="checkoutTitle">Checkout.</h2><p class="checkout-description">This creates a pending demonstration order. No payment will be collected.</p>
      <form class="checkout-form" id="checkoutForm" novalidate>
        <div class="form-field"><label for="customerName">Full name</label><input id="customerName" name="customerName" autocomplete="name" placeholder="Your full name" required minlength="2" maxlength="120" /></div>
        <div class="form-field"><label for="customerEmail">Email address</label><input id="customerEmail" name="customerEmail" type="email" autocomplete="email" placeholder="you@example.com" required maxlength="254" /></div>
        <div class="form-field"><label for="customerAddress">Delivery address</label><input id="customerAddress" name="customerAddress" autocomplete="street-address" placeholder="House no., street, city" required minlength="6" maxlength="500" /></div>
        <p class="form-error" id="checkoutError" role="alert"></p>
        <div class="checkout-total"><span>Order total · ${cartCount()} ${cartCount() === 1 ? "item" : "items"}</span><strong>${formatPrice(cartSubtotal() + (cartSubtotal() >= 2500 ? 0 : 120))}</strong></div>
        <button class="primary-button full-width" type="submit">Place demo order ${icon("arrow")}</button>
      </form>`;
    checkoutModal.hidden = false;
    window.setTimeout(() => document.getElementById("customerName")?.focus(), 80);
  }

  async function placeDemoOrder(form) {
    const name = form.elements.customerName.value.trim();
    const email = form.elements.customerEmail.value.trim();
    const address = form.elements.customerAddress.value.trim();
    const error = document.getElementById("checkoutError");
    const button = form.querySelector('button[type="submit"]');
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (name.length < 2) {
      error.textContent = "Please enter your full name.";
      form.elements.customerName.focus();
      return;
    }
    if (!emailOk) {
      error.textContent = "Please enter a valid email address.";
      form.elements.customerEmail.focus();
      return;
    }
    if (address.length < 6) {
      error.textContent = "Please enter a more complete delivery address.";
      form.elements.customerAddress.focus();
      return;
    }
    if (!checkoutAttemptId) openCheckout();
    button.disabled = true;
    error.textContent = '';
    try {
      const data = await storeApi('/api/orders', {
        method: 'POST',
        body: JSON.stringify({ customerName: name, customerEmail: email, customerAddress: address, idempotencyKey: checkoutAttemptId })
      });
      const order = data.order;
      const count = (data.items || []).reduce((sum, item) => sum + item.quantity, 0);
      checkoutContent.innerHTML = `
        <div class="success-mark">${icon("check")}</div><p class="checkout-intro">Order recorded</p><h2 class="checkout-title" id="checkoutTitle">Thanks, ${escapeHtml(name.split(" ")[0])}.</h2><p class="checkout-description">${escapeHtml(data.notice || 'This is a demonstration order. No payment was collected.')}</p>
        <div class="order-reference"><strong>${escapeHtml(order.orderNumber)}</strong><br />${count} ${count === 1 ? "piece" : "pieces"} · ${formatPrice(order.total)}<br />Status: ${escapeHtml(order.status)} · Payment: ${escapeHtml(order.paymentStatus)}<br />Confirmation for ${escapeHtml(email)}.</div>
        <button class="primary-button full-width" data-action="view-orders">View order history ${icon("arrow")}</button>
        <button class="secondary-button full-width" data-action="finish-order">Back to the store</button>`;
      cart = [];
      updateCartBadges();
      await loadOrders();
    } catch (requestError) {
      error.textContent = requestError.message || 'The order could not be created. Your bag has not been cleared.';
      if (button) button.disabled = false;
    }
  }

    function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[character]));
  }

  function handleAction(actionElement) {
    const action = actionElement.dataset.action;
    const productId = actionElement.dataset.productId;
    switch (action) {
      case "navigate":
        if (actionElement.dataset.page === "home") openHome();
        else navigate(actionElement.dataset.page);
        break;
      case "skip-intro":
        navigate("shop");
        break;
      case "open-product":
        openProduct(productId);
        break;
      case "toggle-saved":
      case "toggle-saved-detail":
        toggleSaved(productId);
        break;
      case "filter-category":
        activeCategory = actionElement.dataset.category || "All";
        updateProductGrid();
        pageContent.querySelectorAll(".filter-chip").forEach((chip) => {
          const active = chip.dataset.category === activeCategory;
          chip.classList.toggle("is-active", active);
          chip.setAttribute("aria-pressed", String(active));
        });
        break;
      case "select-size":
        selectedSize = actionElement.dataset.size || "";
        productModalContent.querySelectorAll(".size-option").forEach((button) => {
          const active = button.dataset.size === selectedSize;
          button.classList.toggle("is-selected", active);
          button.setAttribute("aria-pressed", String(active));
        });
        document.getElementById("sizeError").textContent = "";
        break;
      case "add-to-bag": {
        const product = productById(productId);
        if (!product) break;
        if (!selectedSize) {
          document.getElementById("sizeError").textContent = "Choose a size to continue.";
          productModalContent.querySelector(".size-option")?.focus();
          break;
        }
        addToCart(productId, selectedSize);
        break;
      }
      case "change-quantity":
        changeQuantity(productId, actionElement.dataset.size, Number(actionElement.dataset.delta));
        break;
      case "remove-item":
        removeItem(productId, actionElement.dataset.size);
        break;
      case "checkout":
        openCheckout();
        break;
      case "close-product":
        productModal.hidden = true;
        activeProductId = null;
        selectedSize = "";
        break;
      case "close-checkout":
        checkoutModal.hidden = true;
        break;
      case "clear-filters":
        activeCategory = "All";
        searchQuery = "";
        renderPage();
        break;
      case "finish-order":
        checkoutModal.hidden = true;
        navigate("shop");
        showToast("Thanks for shopping Dia+");
        break;
      case "view-orders":
        checkoutModal.hidden = true;
        navigate("orders");
        break;
      case "retry-products":
        loadProducts().catch((error) => showToast(error.message));
        break;
      case "retry-orders":
        loadOrders();
        break;
    }
  }

  // Delegation keeps interactions working when the rendered product list changes.
  appScreen.addEventListener("click", (event) => {
    const actionElement = event.target.closest("[data-action]");
    if (!actionElement) return;
    if (actionElement.closest("#productModal") && productModal.hidden) return;
    if (actionElement.closest("#checkoutModal") && checkoutModal.hidden) return;
    handleAction(actionElement);
  });

  appScreen.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && event.target.matches('[role="button"][data-action="open-product"]')) {
      event.preventDefault();
      openProduct(event.target.dataset.productId);
    }
  });

  pageContent.addEventListener("input", (event) => {
    if (event.target.id !== "productSearch") return;
    const cursorPosition = event.target.selectionStart;
    searchQuery = event.target.value;
    updateProductGrid();
    const replacement = document.getElementById("productSearch");
    if (replacement) {
      replacement.focus();
      try { replacement.setSelectionRange(cursorPosition, cursorPosition); } catch (_) { /* search input may not support selection */ }
    }
  });
  pageContent.addEventListener("change", (event) => {
    if (event.target.id === 'productSort') sortMode = event.target.value;
    else if (event.target.id === 'priceRange') priceRange = event.target.value;
    else return;
    renderPage();
  });

  checkoutContent.addEventListener("submit", (event) => {
    if (event.target.id !== "checkoutForm") return;
    event.preventDefault();
    placeDemoOrder(event.target);
  });

  productModal.addEventListener("click", (event) => {
    if (event.target === productModal) {
      productModal.hidden = true;
      activeProductId = null;
    }
  });
  checkoutModal.addEventListener("click", (event) => {
    if (event.target === checkoutModal) checkoutModal.hidden = true;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeOverlays();
  });

  document.getElementById("enterButton").addEventListener("click", () => navigate("shop"));
  document.getElementById("skipIntro")?.addEventListener("click", () => navigate("shop"));
  document.getElementById("heroExplore").addEventListener("click", () => navigate("shop"));

  updateCartBadges();
  loadProducts().catch((error) => {
    console.warn('Could not load public catalog.', error);
  });
})();
