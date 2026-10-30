'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  let csrfToken = '';
  function notify(text, success = false) {
    const target = $('dashboardNotice');
    target.textContent = text || '';
    target.classList.toggle('success', success);
    target.hidden = !text;
  }
  async function csrf() {
    const response = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.csrfToken) throw new Error(data.error?.message || 'Could not start a secure session.');
    csrfToken = data.csrfToken;
  }
  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options, credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(options.method ? { 'X-CSRF-Token': csrfToken } : {}), ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || 'Could not load your account details.');
    return data;
  }
  function showOrders(orders) {
    const list = $('orderList');
    list.replaceChildren();
    if (!orders.length) {
      const empty = document.createElement('p');
      empty.className = 'dashboard-empty';
      empty.textContent = 'No orders yet. Your first Dia+ order will appear here after checkout.';
      list.append(empty);
      return;
    }
    for (const order of orders) {
      const row = document.createElement('article');
      row.className = 'dashboard-order';
      const summary = document.createElement('div');
      const number = document.createElement('strong');
      number.textContent = order.orderNumber || 'Dia+ order';
      const meta = document.createElement('small');
      const date = order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'Date unavailable';
      const items = Array.isArray(order.items) ? order.items.length : 0;
      meta.textContent = date + ' · ' + items + (items === 1 ? ' item' : ' items');
      const status = document.createElement('span');
      status.className = 'dashboard-status';
      status.textContent = String(order.status || 'pending').replaceAll('_', ' ');
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
  $('dashboardSignOut').addEventListener('click', async () => {
    const button = $('dashboardSignOut');
    button.disabled = true;
    try {
      await api('/api/auth/logout', { method: 'POST' });
      location.replace('/login?loggedOut=1');
    } catch (error) {
      notify(error.message || 'Sign out failed.');
      button.disabled = false;
    }
  });
  (async () => {
    try {
      await csrf();
      const me = await api('/api/auth/me');
      if (!me.authenticated || !me.user) { location.replace('/login'); return; }
      if (me.user.role === 'admin' && me.authMethod === 'admin') { location.replace('/admin'); return; }
      if (me.user.role !== 'user' || me.user.status !== 'active') { location.replace('/login'); return; }
      $('customerName').textContent = me.user.name || 'there';
      $('accountStatus').textContent = 'Active';
      $('accountRole').textContent = 'Customer';
      const orders = await api('/api/orders');
      $('orderCount').textContent = String((orders.orders || []).length);
      showOrders(orders.orders || []);
    } catch (error) {
      notify(error.message || 'Your account could not be loaded.');
      $('orderList').textContent = 'Refresh this page or sign in again to reload your order history.';
    }
  })();
})();
