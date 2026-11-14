'use strict';
(() => {
  const $ = (selector) => document.querySelector(selector);
  let csrf = '';
  let page = 1;
  let pages = 1;
  let searchTimer = null;
  let pendingUserChange = null;
  let productRows = [];
  let orderRows = [];
  let productSearchTimer = null;
  let orderSearchTimer = null;

  const notice = (element, message, success = false) => {
    if (!element) return;
    element.textContent = message || '';
    element.classList.toggle('success', success);
    element.hidden = !message;
  };
  const formatPrice = (value) => new Intl.NumberFormat('en-PH', {
    style: 'currency', currency: 'PHP', maximumFractionDigits: 0
  }).format(Number(value) || 0);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));

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

  async function getCsrf() {
    const response = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.csrfToken) throw new Error(apiFailureMessage(response, data, 'GET', '/api/auth/csrf', 'Secure session could not be started. Refresh and try again.'));
    csrf = data.csrfToken;
    return csrf;
  }
  async function api(url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    if (options.body) headers['Content-Type'] = 'application/json';
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      if (!csrf) await getCsrf();
      headers['X-CSRF-Token'] = csrf;
    }
    const response = await fetch(url, { ...options, method, headers, credentials: 'same-origin' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(apiFailureMessage(response, data, method, url, 'Request failed. Please try again.'));
      error.status = response.status;
      error.code = data?.error?.code;
      throw error;
    }
    if (data.csrfToken) csrf = data.csrfToken;
    return data;
  }

  function showDashboard(user) {
    // Account names and usernames are user-controlled; textContent keeps them as text, never markup.
    $('#adminIdentity').textContent = (user.name || 'Administrator') + ' · ' + (user.username || user.email || '');
    loadAll();
  }

  async function loadStats() {
    const { stats, financialNotice } = await api('/api/admin/stats');
    const values = {
      '#statUsers': stats.totalUsers,
      '#statActive': stats.activeUsers,
      '#statAdmins': stats.administrators,
      '#statNew': stats.newUsersThisWeek,
      '#statProducts': stats.totalProducts,
      '#statStock': stats.productsInStock,
      '#statLowStock': stats.lowStockProducts,
      '#statOutStock': stats.outOfStockProducts,
      '#statOrders': stats.totalOrders,
      '#statPending': stats.pendingOrders,
      '#statCompletedValue': formatPrice(stats.completedOrderValue),
      '#statRevenue': formatPrice(stats.collectedRevenue),
      '#statProfit': stats.profitAvailable && stats.grossProfit !== null ? formatPrice(stats.grossProfit) : 'Not available'
    };
    for (const [selector, value] of Object.entries(values)) $(selector).textContent = value ?? '0';
    if (financialNotice) notice($('#dashNotice'), financialNotice);
  }

  async function loadUsers() {
    const query = new URLSearchParams({
      page: String(page),
      limit: '10',
      search: $('#userSearch').value.trim(),
      role: $('#roleFilter').value,
      status: $('#statusFilter').value
    });
    const data = await api('/api/admin/users?' + query.toString());
    pages = Math.max(1, data.pagination.pages);
    $('#pageLabel').textContent = 'Page ' + data.pagination.page + ' of ' + pages + ' · ' + data.pagination.total + ' accounts';
    $('#prevPage').disabled = page <= 1;
    $('#nextPage').disabled = page >= pages;
    const body = $('#userRows');
    body.replaceChildren();
    if (!data.users.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 5;
      td.textContent = 'No accounts match these filters.';
      tr.append(td);
      body.append(tr);
      return;
    }
    data.users.forEach((user) => {
      const tr = document.createElement('tr');
      const account = document.createElement('td');
      const name = document.createElement('strong');
      const email = document.createElement('small');
      const role = document.createElement('td');
      const status = document.createElement('td');
      const joined = document.createElement('td');
      const actions = document.createElement('td');
      const roleBadge = document.createElement('span');
      const statusBadge = document.createElement('span');
      const select = document.createElement('select');
      name.textContent = user.name;
      email.textContent = user.email;
      account.append(name, email);
      roleBadge.className = 'admin-role';
      roleBadge.textContent = user.role === 'admin' ? 'Administrator' : 'Customer';
      role.append(roleBadge);
      statusBadge.className = 'admin-status ' + (user.status === 'disabled' ? 'disabled' : '');
      statusBadge.textContent = user.status;
      status.append(statusBadge);
      joined.textContent = user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—';
      select.className = 'admin-action';
      select.setAttribute('aria-label', 'Actions for ' + user.email);
      [['', 'Actions'], ['status:disabled', 'Disable'], ['status:active', 'Enable'], ['role:admin', 'Grant admin'], ['role:user', 'Make customer']].forEach(([value, label]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        select.append(option);
      });
      select.addEventListener('change', () => {
        if (!select.value) return;
        const [field, value] = select.value.split(':');
        select.value = '';
        openUserConfirm(user, field, value);
      });
      actions.append(select);
      tr.append(account, role, status, joined, actions);
      body.append(tr);
    });
  }

  function openUserConfirm(user, field, value) {
    pendingUserChange = { user, field, value };
    const promotion = field === 'role' && value === 'admin';
    $('#confirmTitle').textContent = promotion ? 'Grant administrator access?' : 'Confirm account change';
    $('#confirmText').textContent = 'You are about to ' +
      (field === 'role' ? (value === 'admin' ? 'make this account an administrator' : 'change this account to a customer') : value + ' this account') +
      ' for ' + user.name + ' (' + user.email + '). The server will verify this action.';
    $('#promoteLabel').hidden = !promotion;
    $('#promotePassword').hidden = !promotion;
    $('#promotePassword').required = promotion;
    $('#promotePassword').value = '';
    $('#adminConfirm').showModal();
  }

  async function applyUserChange() {
    if (!pendingUserChange) return;
    const { user, field, value } = pendingUserChange;
    const promotion = field === 'role' && value === 'admin';
    const password = $('#promotePassword').value;
    if (promotion && password.length < 14) {
      notice($('#dashNotice'), 'Administrator passwords must be at least 14 characters.');
      return;
    }
    const button = $('#applyConfirm');
    button.disabled = true;
    try {
      const body = { [field]: value };
      if (promotion) body.adminPassword = password;
      await api('/api/admin/users/' + encodeURIComponent(user.id), { method: 'PATCH', body: JSON.stringify(body) });
      $('#adminConfirm').close();
      pendingUserChange = null;
      notice($('#dashNotice'), 'Account updated.', true);
      await loadUsers();
      await loadStats();
    } catch (error) {
      notice($('#dashNotice'), error.message);
    } finally {
      button.disabled = false;
    }
  }

  async function loadProducts() {
    const query = new URLSearchParams({
      search: $('#productSearch').value.trim(),
      status: $('#productStatusFilter').value
    });
    const data = await api('/api/admin/products?' + query.toString());
    productRows = data.products || [];
    renderProducts();
  }
  function renderProducts() {
    const body = $('#productRows');
    body.replaceChildren();
    if (!productRows.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 6;
      cell.textContent = 'No products found. Add a product above or run the documented sample-catalog seed.';
      row.append(cell);
      body.append(row);
      return;
    }
    productRows.forEach((product) => {
      const row = document.createElement('tr');
      const name = document.createElement('td');
      const price = document.createElement('td');
      const cost = document.createElement('td');
      const stock = document.createElement('td');
      const status = document.createElement('td');
      const actions = document.createElement('td');
      const title = document.createElement('strong');
      const meta = document.createElement('small');
      const edit = document.createElement('button');
      const archive = document.createElement('button');
      title.textContent = product.name;
      meta.textContent = product.category + (product.isSample ? ' · sample inventory' : '');
      name.append(title, meta);
      price.textContent = formatPrice(product.price);
      cost.textContent = product.costPrice === null || product.costPrice === undefined ? 'Unknown' : formatPrice(product.costPrice);
      stock.textContent = String(product.stock);
      status.innerHTML = '<span class="admin-status ' + (product.status === 'archived' ? 'disabled' : '') + '">' + escapeHtml(product.status) + '</span>';
      edit.type = 'button';
      edit.className = 'admin-secondary admin-small-button';
      edit.textContent = 'Edit';
      edit.addEventListener('click', () => fillProductForm(product));
      archive.type = 'button';
      archive.className = 'admin-secondary admin-small-button';
      archive.textContent = product.status === 'active' ? 'Archive' : 'Restore';
      archive.addEventListener('click', () => changeProductStatus(product, product.status === 'active' ? 'archived' : 'active'));
      actions.append(edit, archive);
      row.append(name, price, cost, stock, status, actions);
      body.append(row);
    });
  }

  function fillProductForm(product) {
    $('#productId').value = product.id;
    $('#productName').value = product.name;
    $('#productCategory').value = product.category;
    $('#productDescription').value = product.description || '';
    $('#productPrice').value = product.price;
    $('#productCostPrice').value = product.costPrice ?? '';
    $('#productStock').value = product.stock;
    $('#productColor').value = product.color;
    $('#productSizes').value = (product.sizes || []).join(', ');
    $('#productTag').value = product.tag || 'New arrival';
    $('#productImage').value = product.image || '/assets/dia-editorial.webp';
    $('#productImagePosition').value = product.position || 'center center';
    $('#productSubmit').textContent = product.status === 'archived' ? 'Save archived product' : 'Save product changes';
    notice($('#productNotice'), 'Editing ' + product.name + '.');
    $('#productForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function clearProductForm() {
    $('#productForm').reset();
    $('#productId').value = '';
    $('#productImage').value = '/assets/dia-editorial.webp';
    $('#productImagePosition').value = 'center center';
    $('#productTag').value = 'New arrival';
    $('#productSubmit').textContent = 'Add product';
    notice($('#productNotice'), '');
  }

  async function submitProduct(event) {
    event.preventDefault();
    const id = $('#productId').value;
    const costText = $('#productCostPrice').value.trim();
    const body = {
      name: $('#productName').value.trim(),
      category: $('#productCategory').value.trim(),
      description: $('#productDescription').value.trim(),
      price: Number($('#productPrice').value),
      costPrice: costText === '' ? null : Number(costText),
      stock: Number($('#productStock').value),
      color: $('#productColor').value.trim(),
      sizes: $('#productSizes').value.split(',').map((size) => size.trim()).filter(Boolean),
      tag: $('#productTag').value.trim(),
      image: $('#productImage').value.trim(),
      imagePosition: $('#productImagePosition').value.trim()
    };
    const button = $('#productSubmit');
    button.disabled = true;
    try {
      const result = await api(id ? '/api/admin/products/' + encodeURIComponent(id) : '/api/admin/products', {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify(body)
      });
      notice($('#productNotice'), (id ? 'Updated ' : 'Created ') + result.product.name + '.', true);
      clearProductForm();
      await loadProducts();
      await loadStats();
    } catch (error) {
      notice($('#productNotice'), error.message);
    } finally {
      button.disabled = false;
    }
  }

  async function changeProductStatus(product, status) {
    const action = status === 'archived' ? 'archive' : 'restore';
    if (!window.confirm('Are you sure you want to ' + action + ' ' + product.name + '?')) return;
    try {
      await api('/api/admin/products/' + encodeURIComponent(product.id), { method: 'PATCH', body: JSON.stringify({ status }) });
      notice($('#productNotice'), product.name + ' ' + (status === 'archived' ? 'archived.' : 'restored.'), true);
      await loadProducts();
      await loadStats();
    } catch (error) {
      notice($('#productNotice'), error.message);
    }
  }

  const allowedOrderTransitions = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['processing', 'cancelled'],
    processing: ['shipped', 'cancelled'],
    shipped: ['completed', 'refunded'],
    completed: ['refunded'],
    cancelled: [],
    refunded: []
  };
  async function loadOrders() {
    const query = new URLSearchParams({
      search: $('#orderSearch').value.trim(),
      status: $('#orderStatusFilter').value
    });
    const data = await api('/api/admin/orders?' + query.toString());
    orderRows = data.orders || [];
    renderOrders();
  }
  function renderOrders() {
    const body = $('#orderRows');
    body.replaceChildren();
    if (!orderRows.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 6;
      cell.textContent = 'No order records found.';
      row.append(cell);
      body.append(row);
      return;
    }
    orderRows.forEach((order) => {
      const row = document.createElement('tr');
      const ref = document.createElement('td');
      const customer = document.createElement('td');
      const itemCell = document.createElement('td');
      const total = document.createElement('td');
      const status = document.createElement('td');
      const action = document.createElement('td');
      const number = document.createElement('strong');
      const date = document.createElement('small');
      const email = document.createElement('small');
      number.textContent = order.orderNumber;
      date.textContent = new Date(order.createdAt).toLocaleString();
      ref.append(number, date);
      customer.append(document.createTextNode(order.customerName));
      email.textContent = order.customerEmail;
      customer.append(email);
      itemCell.textContent = (order.items || []).map((item) => item.name + ' · ' + item.size + ' × ' + item.quantity).join('; ');
      total.textContent = formatPrice(order.total);
      status.innerHTML = '<span class="admin-status">' + escapeHtml(order.status) + '</span><small>' + escapeHtml(order.paymentStatus) + '</small>';
      const select = document.createElement('select');
      select.className = 'admin-action';
      select.setAttribute('aria-label', 'Update status for ' + order.orderNumber);
      const choices = [['', 'Choose status'], [order.status, order.status], ...(allowedOrderTransitions[order.status] || []).map((next) => [next, next])];
      choices.forEach(([value, label]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        select.append(option);
      });
      select.addEventListener('change', async () => {
        const next = select.value;
        select.value = '';
        if (!next || next === order.status) return;
        if (!window.confirm('Change ' + order.orderNumber + ' from ' + order.status + ' to ' + next + '?')) return;
        try {
          await api('/api/admin/orders/' + encodeURIComponent(order.id), { method: 'PATCH', body: JSON.stringify({ status: next }) });
          notice($('#dashNotice'), 'Order ' + order.orderNumber + ' updated.', true);
          await Promise.all([loadOrders(), loadStats(), loadAnalytics()]);
        } catch (error) {
          notice($('#dashNotice'), error.message);
        }
      });
      action.append(select);
      row.append(ref, customer, itemCell, total, status, action);
      body.append(row);
    });
  }

  async function loadAnalytics() {
    const days = $('#analyticsDays').value;
    const data = await api('/api/admin/analytics?days=' + encodeURIComponent(days));
    const chart = $('#salesChart');
    const daily = data.daily || [];
    if (!daily.length) {
      chart.innerHTML = '<p>No completed orders in this period. Values appear here when order records reach completed status.</p>';
    } else {
      const maxValue = Math.max(1, ...daily.map((row) => Number(row.completedOrderValue) || 0));
      chart.innerHTML = daily.map((row) => {
        const value = Number(row.completedOrderValue) || 0;
        const height = Math.max(value > 0 ? 4 : 0, Math.round(value / maxValue * 100));
        return '<div class="sales-bar-column" title="' + escapeHtml(row.day) + ': ' + escapeHtml(formatPrice(value)) + '"><div class="sales-bar-value">' + escapeHtml(formatPrice(value)) + '</div><div class="sales-bar-track"><span class="sales-bar-fill" style="height:' + height + '%"></span></div><small>' + escapeHtml(row.day.slice(5)) + '</small></div>';
      }).join('');
    }
    const top = $('#topProductRows');
    top.replaceChildren();
    if (!(data.topProducts || []).length) {
      const row = document.createElement('tr'); const cell = document.createElement('td');
      cell.colSpan = 3; cell.textContent = 'No completed item sales in this period.'; row.append(cell); top.append(row);
    } else {
      data.topProducts.forEach((item) => {
        const row = document.createElement('tr');
        [item.name, String(item.units), formatPrice(item.completedOrderValue)].forEach((value) => {
          const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
        });
        top.append(row);
      });
    }
    const categories = $('#categoryRows');
    categories.replaceChildren();
    if (!(data.byCategory || []).length) {
      const row = document.createElement('tr'); const cell = document.createElement('td');
      cell.colSpan = 3; cell.textContent = 'No completed item sales in this period.'; row.append(cell); categories.append(row);
    } else {
      data.byCategory.forEach((item) => {
        const row = document.createElement('tr');
        [item.category, String(item.units), formatPrice(item.completedOrderValue)].forEach((value) => {
          const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
        });
        categories.append(row);
      });
    }
  }

  async function loadAll() {
    notice($('#dashNotice'), '');
    const tasks = await Promise.allSettled([loadStats(), loadUsers(), loadProducts(), loadOrders(), loadAnalytics()]);
    const failed = tasks.find((task) => task.status === 'rejected');
    if (failed) {
      const error = failed.reason;
      if (error?.status === 401 || error?.status === 403) {
        window.location.replace('/admin/login');
        return;
      }
      notice($('#dashNotice'), error?.message || 'Some dashboard data could not be loaded. Use Refresh to retry.');
    }
  }

  $('#adminLogout').addEventListener('click', async () => {
    const button = $('#adminLogout');
    button.disabled = true;
    try {
      await api('/api/auth/logout', { method: 'POST', body: '{}' });
      csrf = '';
      window.location.replace('/admin/login?loggedOut=1');
    } catch (error) {
      notice($('#dashNotice'), 'Sign out failed: ' + error.message);
    } finally {
      button.disabled = false;
    }
  });
  $('#refreshUsers').addEventListener('click', loadUsers);
  $('#userSearch').addEventListener('input', () => {
    clearTimeout(searchTimer); page = 1;
    searchTimer = setTimeout(() => loadUsers().catch((error) => notice($('#dashNotice'), error.message)), 250);
  });
  $('#roleFilter').addEventListener('change', () => { page = 1; loadUsers().catch((error) => notice($('#dashNotice'), error.message)); });
  $('#statusFilter').addEventListener('change', () => { page = 1; loadUsers().catch((error) => notice($('#dashNotice'), error.message)); });
  $('#prevPage').addEventListener('click', () => { page = Math.max(1, page - 1); loadUsers().catch((error) => notice($('#dashNotice'), error.message)); });
  $('#nextPage').addEventListener('click', () => { page = Math.min(pages, page + 1); loadUsers().catch((error) => notice($('#dashNotice'), error.message)); });
  $('#applyConfirm').addEventListener('click', (event) => { event.preventDefault(); applyUserChange(); });
  $('#cancelConfirm').addEventListener('click', (event) => { event.preventDefault(); $('#adminConfirm').close(); pendingUserChange = null; });

  $('#productForm').addEventListener('submit', submitProduct);
  $('#productReset').addEventListener('click', clearProductForm);
  $('#refreshProducts').addEventListener('click', () => loadProducts().catch((error) => notice($('#productNotice'), error.message)));
  $('#productStatusFilter').addEventListener('change', () => loadProducts().catch((error) => notice($('#productNotice'), error.message)));
  $('#productSearch').addEventListener('input', () => {
    clearTimeout(productSearchTimer);
    productSearchTimer = setTimeout(() => loadProducts().catch((error) => notice($('#productNotice'), error.message)), 250);
  });
  $('#refreshOrders').addEventListener('click', () => loadOrders().catch((error) => notice($('#dashNotice'), error.message)));
  $('#orderStatusFilter').addEventListener('change', () => loadOrders().catch((error) => notice($('#dashNotice'), error.message)));
  $('#orderSearch').addEventListener('input', () => {
    clearTimeout(orderSearchTimer);
    orderSearchTimer = setTimeout(() => loadOrders().catch((error) => notice($('#dashNotice'), error.message)), 250);
  });
  $('#analyticsDays').addEventListener('change', () => loadAnalytics().catch((error) => notice($('#dashNotice'), error.message)));

  const adminNavLinks = Array.from(document.querySelectorAll('[data-admin-nav]'));
  adminNavLinks.forEach((link) => link.addEventListener('click', () => {
    adminNavLinks.forEach((item) => {
      const active = item === link;
      item.classList.toggle('is-active', active);
      if (active) item.setAttribute('aria-current', 'location');
      else item.removeAttribute('aria-current');
    });
  }));
  if ('IntersectionObserver' in window) {
    const sections = adminNavLinks
      .map((link) => document.getElementById(link.dataset.adminNav))
      .filter(Boolean);
    const sectionObserver = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      adminNavLinks.forEach((link) => {
        const active = link.dataset.adminNav === visible.target.id;
        link.classList.toggle('is-active', active);
        if (active) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }, { rootMargin: '-18% 0px -65% 0px', threshold: [0, 0.1, 0.25, 0.5] });
    sections.forEach((section) => sectionObserver.observe(section));
  }

  (async () => {
    try {
      await getCsrf();
      const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
      const data = await response.json().catch(() => ({}));
      if (response.status === 404) throw new Error(apiFailureMessage(response, data, 'GET', '/api/auth/me', 'Could not verify the administrator session.'));
      if (response.ok && data.user?.role === 'admin' && data.authMethod === 'admin') {
        showDashboard(data.user);
      } else if (response.ok && data.user) {
        window.location.replace('/admin/login');
      } else {
        window.location.replace('/admin/login');
      }
    } catch (error) {
      document.body.insertAdjacentHTML('afterbegin', '<p role="alert" class="admin-notice">Authentication service unavailable. Check that the Dia+ server is running.</p>');
    }
  })();
})();
