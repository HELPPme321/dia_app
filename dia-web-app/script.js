/* Dia+ storefront demo — vanilla JavaScript only. Cart and saved items persist in localStorage. */
(() => {
  "use strict";

  const STORAGE_KEYS = { cart: "dia-plus-cart-v1", saved: "dia-plus-saved-v1" };
  const PRODUCTS = [
    {
      id: "essential-hoodie",
      name: "Essential Hoodie",
      category: "Tops",
      price: 1890,
      tag: "Bestseller",
      color: "Forest",
      sizes: ["S", "M", "L", "XL"],
      position: "center 43%",
      description: "A relaxed, heavyweight layer designed for repeat wear. Soft brushed fleece, an easy dropped shoulder, and a small signature sparkle."
    },
    {
      id: "everyday-tee",
      name: "Everyday Tee",
      category: "Tops",
      price: 890,
      tag: "New arrival",
      color: "Oat",
      sizes: ["S", "M", "L", "XL"],
      position: "76% 39%",
      description: "A clean-cut, easygoing cotton tee in a warm oat shade. Made to sit comfortably on its own or layer under your favorite hoodie."
    },
    {
      id: "core-cap",
      name: "Core Cap",
      category: "Headwear",
      price: 650,
      tag: "Everyday staple",
      color: "Washed black",
      sizes: ["One size"],
      position: "36% 81%",
      description: "An understated six-panel cap with a curved brim and an embroidered sparkle. Adjustable at the back for an easy, everyday fit."
    },
    {
      id: "weekend-layer",
      name: "Weekend Layer",
      category: "Tops",
      price: 1590,
      tag: "Limited drop",
      color: "Deep olive",
      sizes: ["S", "M", "L", "XL"],
      position: "41% 53%",
      description: "A roomy, slightly structured layer in our signature deep olive. Minimal detailing lets the fabric, shape, and feel do the talking."
    }
  ];

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
  let cart = readStorage(STORAGE_KEYS.cart, []);
  let saved = readStorage(STORAGE_KEYS.saved, []);

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
      localStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(cart));
      localStorage.setItem(STORAGE_KEYS.saved, JSON.stringify(saved));
    } catch (error) {
      console.warn("Storage is unavailable. Changes will last for this session only.", error);
    }
  }

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
    currentPage = ["shop", "saved", "bag"].includes(page) ? page : "shop";
    homeView.hidden = true;
    homeView.classList.remove("is-active");
    storeView.hidden = false;
    storeView.classList.add("is-active");
    renderPage();
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
    return `<div class="page-heading"><p class="page-kicker">THE DIA EDIT · DROP Nº 01</p><h1 class="page-title">Find your form.</h1><p class="page-subtitle">Everyday essentials. Quietly different, made to be worn your way.</p></div>`;
  }

  function productCard(product) {
    const isSaved = saved.includes(product.id);
    return `
      <article class="product-card" data-product-card="${product.id}">
        <div class="product-image-wrap" role="button" tabindex="0" data-action="open-product" data-product-id="${product.id}" aria-label="View ${product.name} details">
          <img class="product-image" src="assets/dia-editorial.webp" alt="${product.name} in ${product.color}" loading="lazy" style="object-position:${product.position}" />
          <span class="product-tag">${product.tag}</span>
          <button class="heart-button ${isSaved ? "is-saved" : ""}" data-action="toggle-saved" data-product-id="${product.id}" aria-label="${isSaved ? "Remove from" : "Add to"} saved items" aria-pressed="${isSaved}">${icon("heart")}</button>
        </div>
        <div class="product-meta">
          <h3 class="product-name" role="button" tabindex="0" data-action="open-product" data-product-id="${product.id}">${product.name}</h3>
          <p class="product-price">${formatPrice(product.price)}</p>
        </div>
        <p class="product-category">${product.color} · ${product.category}</p>
        <button class="quick-add" data-action="open-product" data-product-id="${product.id}">Quick view ${icon("arrow")}</button>
      </article>`;
  }

  function getVisibleProducts() {
    let list = [...PRODUCTS];
    if (currentPage === "saved") list = list.filter((product) => saved.includes(product.id));
    if (activeCategory !== "All" && currentPage === "shop") {
      list = list.filter((product) => product.category === activeCategory);
    }
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      list = list.filter((product) => `${product.name} ${product.category} ${product.color} ${product.tag}`.toLowerCase().includes(query));
    }
    return list;
  }

  function renderGrid() {
    const products = getVisibleProducts();
    const title = currentPage === "saved" ? "Your favorites" : "The collection";
    const countText = `${products.length} ${products.length === 1 ? "piece" : "pieces"}`;
    if (!products.length) {
      const isSavedEmpty = currentPage === "saved" && !searchQuery.trim();
      return `<div class="empty-state">${icon(isSavedEmpty ? "heart" : "search")}<h3>${isSavedEmpty ? "Nothing saved just yet." : "No pieces found."}</h3><p>${isSavedEmpty ? "Tap the little heart on anything that feels like you." : "Try another search or choose a different category."}</p>${isSavedEmpty ? '<button class="primary-button" data-action="navigate" data-page="shop">Explore the collection</button>' : '<button class="secondary-button" data-action="clear-filters">Clear filters</button>'}</div>`;
    }
    return `<div class="section-label-row"><h2 class="section-label">${title}</h2><span class="section-count">${countText}</span></div><div class="product-grid">${products.map(productCard).join("")}</div>`;
  }

  function renderShop() {
    const categories = ["All", "Tops", "Headwear"];
    return `${pageHeader()}
      <label class="search-box">${icon("search")}<input type="search" id="productSearch" autocomplete="off" value="${escapeHtml(searchQuery)}" placeholder="Search your next favorite..." aria-label="Search products" /></label>
      <div class="filter-row" role="group" aria-label="Filter products by category">
        ${categories.map((category) => `<button class="filter-chip ${activeCategory === category ? "is-active" : ""}" data-action="filter-category" data-category="${category}" aria-pressed="${activeCategory === category}">${category}</button>`).join("")}
      </div>
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
        <img class="bag-item-image" src="assets/dia-editorial.webp" alt="${product.name}" style="object-position:${product.position}" />
        <div class="bag-item-info">
          <div class="bag-item-top"><div><h3 class="bag-item-name">${product.name}</h3><p class="bag-item-size">${product.color} · ${item.size}</p></div><button class="remove-item" data-action="remove-item" data-product-id="${product.id}" data-size="${item.size}" aria-label="Remove ${product.name}">${icon("trash")}</button></div>
          <div class="bag-item-bottom"><div class="quantity-control" aria-label="Quantity controls"><button data-action="change-quantity" data-delta="-1" data-product-id="${product.id}" data-size="${item.size}" aria-label="Decrease quantity">−</button><span>${item.quantity}</span><button data-action="change-quantity" data-delta="1" data-product-id="${product.id}" data-size="${item.size}" aria-label="Increase quantity">+</button></div><p class="bag-item-price">${formatPrice(product.price * item.quantity)}</p></div>
        </div>
      </article>`;
    }).join("");

    const subtotal = cartSubtotal();
    const shipping = subtotal >= 2500 ? 0 : 120;
    const total = subtotal + shipping;
    return `${pageHeader()}<div class="bag-list">${items}</div>
      <div class="order-summary"><p class="summary-line"><span>Subtotal</span><strong>${formatPrice(subtotal)}</strong></p><p class="summary-line"><span>Shipping</span><strong>${shipping === 0 ? "Free" : formatPrice(shipping)}</strong></p><p class="summary-line total"><span>Total</span><strong>${formatPrice(total)}</strong></p></div>
      <p class="shipping-note">${icon("truck")} ${shipping === 0 ? "You've unlocked complimentary shipping." : `Add ${formatPrice(2500 - subtotal)} more for free shipping.`}</p>
      <div class="bag-actions"><button class="primary-button full-width" data-action="checkout">Continue to checkout ${icon("arrow")}</button><button class="secondary-button full-width" data-action="navigate" data-page="shop">Continue shopping</button></div>`;
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
    else pageContent.innerHTML = renderShop();
    pageContent.scrollTop = 0;
  }

  function openProduct(id) {
    const product = productById(id);
    if (!product) return;
    activeProductId = id;
    selectedSize = "";
    const isSaved = saved.includes(id);
    productModalContent.innerHTML = `
      <div class="detail-image-wrap"><img class="detail-image" src="assets/dia-editorial.webp" alt="${product.name} in ${product.color}" style="object-position:${product.position}" /></div>
      <div class="detail-copy">
        <p class="page-kicker">${product.tag} · ${product.category}</p>
        <div class="detail-title-row"><h2 class="detail-name" id="detailName">${product.name}</h2><p class="detail-price">${formatPrice(product.price)}</p></div>
        <p class="detail-description">${product.description}</p>
        <p class="option-title"><span>Choose your size</span><span class="option-hint">Color: ${product.color}</span></p>
        <div class="size-options" role="group" aria-label="Choose a size">${product.sizes.map((size) => `<button class="size-option" data-action="select-size" data-size="${size}" aria-pressed="false">${size}</button>`).join("")}</div>
        <p class="form-error" id="sizeError" aria-live="polite"></p>
        <div class="detail-actions"><button class="icon-button detail-heart ${isSaved ? "is-saved" : ""}" data-action="toggle-saved-detail" data-product-id="${product.id}" aria-label="${isSaved ? "Remove from saved items" : "Save item"}" aria-pressed="${isSaved}">${icon("heart")}</button><button class="primary-button" data-action="add-to-bag" data-product-id="${product.id}">Add to bag · ${formatPrice(product.price)}</button></div>
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

  function addToCart(productId, size) {
    const product = productById(productId);
    if (!product) return;
    const existing = cart.find((item) => item.productId === productId && item.size === size);
    if (existing) existing.quantity += 1;
    else cart.push({ productId, size, quantity: 1 });
    saveStorage();
    updateCartBadges();
    productModal.hidden = true;
    activeProductId = null;
    showToast(`${product.name} added to your bag`);
    if (currentPage === "bag") renderPage();
  }

  function changeQuantity(productId, size, delta) {
    const item = cart.find((entry) => entry.productId === productId && entry.size === size);
    if (!item) return;
    item.quantity += delta;
    if (item.quantity <= 0) cart = cart.filter((entry) => entry !== item);
    saveStorage();
    renderPage();
  }

  function removeItem(productId, size) {
    const product = productById(productId);
    cart = cart.filter((item) => !(item.productId === productId && item.size === size));
    saveStorage();
    renderPage();
    if (product) showToast(`${product.name} removed from your bag`);
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
    checkoutContent.innerHTML = `
      <p class="checkout-intro">Almost yours</p><h2 class="checkout-title" id="checkoutTitle">Checkout.</h2><p class="checkout-description">Add your delivery details to place a demo order. No payment will be collected.</p>
      <form class="checkout-form" id="checkoutForm" novalidate>
        <div class="form-field"><label for="customerName">Full name</label><input id="customerName" name="customerName" autocomplete="name" placeholder="Your full name" required minlength="2" /></div>
        <div class="form-field"><label for="customerEmail">Email address</label><input id="customerEmail" name="customerEmail" type="email" autocomplete="email" placeholder="you@example.com" required /></div>
        <div class="form-field"><label for="customerAddress">Delivery address</label><input id="customerAddress" name="customerAddress" autocomplete="street-address" placeholder="House no., street, city" required minlength="6" /></div>
        <p class="form-error" id="checkoutError" role="alert"></p>
        <div class="checkout-total"><span>Order total · ${cartCount()} ${cartCount() === 1 ? "item" : "items"}</span><strong>${formatPrice(cartSubtotal() + (cartSubtotal() >= 2500 ? 0 : 120))}</strong></div>
        <button class="primary-button full-width" type="submit">Place demo order ${icon("arrow")}</button>
      </form>`;
    checkoutModal.hidden = false;
    window.setTimeout(() => document.getElementById("customerName")?.focus(), 80);
  }

  function placeDemoOrder(form) {
    const name = form.elements.customerName.value.trim();
    const email = form.elements.customerEmail.value.trim();
    const address = form.elements.customerAddress.value.trim();
    const error = document.getElementById("checkoutError");
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
    const reference = `DIA-${Date.now().toString().slice(-6)}`;
    const total = cartSubtotal() + (cartSubtotal() >= 2500 ? 0 : 120);
    checkoutContent.innerHTML = `
      <div class="success-mark">${icon("check")}</div><p class="checkout-intro">Order received</p><h2 class="checkout-title" id="checkoutTitle">Thanks, ${escapeHtml(name.split(" ")[0])}.</h2><p class="checkout-description">Your demo order has been recorded in this session. This sample site has no payment or delivery backend.</p>
      <div class="order-reference"><strong>${reference}</strong><br />${cartCount()} ${cartCount() === 1 ? "piece" : "pieces"} · ${formatPrice(total)}<br />Confirmation preview for ${escapeHtml(email)}.</div>
      <button class="primary-button full-width" data-action="finish-order">Back to the store ${icon("arrow")}</button>`;
    cart = [];
    saveStorage();
    updateCartBadges();
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
  document.getElementById("heroExplore").addEventListener("click", () => navigate("shop"));

  updateCartBadges();
})();
