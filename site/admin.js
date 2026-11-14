// admin.js - Dia Atelier Administration Console direct Supabase integration
'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const money = (v) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(Number(v) || 0);
  const dateLabel = (v) => (v ? new Date(v).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const safe = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let adminUser = null;
  let adminProfile = null;
  let orders = [];
  let products = [];
  let users = [];
  let analyticsStats = null;
  let days = 7;
  let orderFilter = 'all';
  let searchTimer = null;
  let slide = 0;
  let slideTimer = null;
  let paused = false;

  const slides = Array.from(document.querySelectorAll('.hero-slide'));
  const dots = Array.from(document.querySelectorAll('.hero-dot'));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const sampleRevenue = [12400, 16800, 14200, 21600, 19400, 24200, 29640];
  const sampleMix = [
    { category: 'Essentials', value: 45 },
    { category: 'Bottoms', value: 26 },
    { category: 'Accessories', value: 19 },
    { category: 'Outerwear', value: 10 }
  ];
  const sampleSpark = [
    [2, 12, 8, 17, 14, 22, 25, 30],
    [5, 9, 7, 18, 14, 25, 22, 31],
    [3, 10, 9, 12, 17, 14, 25, 31],
    [30, 28, 26, 28, 20, 17, 13, 10]
  ];

  function showError(message) {
    const node = document.createElement('div');
    node.className = 'sample-banner';
    node.style.background = 'rgba(230, 90, 90, 0.18)';
    node.style.borderColor = 'rgba(230, 90, 90, 0.4)';
    node.style.color = '#ffb3b3';
    node.textContent = message;
    document.querySelector('.main')?.prepend(node);
    setTimeout(() => node.remove(), 6000);
  }

  function statusFor(order) {
    if (order.payment_status === 'paid' || order.paymentStatus === 'paid') return 'Paid';
    const s = String(order.status || 'pending').toLowerCase();
    if (s === 'processing' || s === 'confirmed') return 'Packing';
    if (s === 'shipped') return 'Shipped';
    if (s === 'pending') return 'Pending';
    if (s === 'refunded') return 'Refunded';
    if (s === 'cancelled') return 'Cancelled';
    return 'Completed';
  }

  function statusClass(label) {
    return label.toLowerCase();
  }

  function orderMatchesFilter(order) {
    const label = statusFor(order).toLowerCase();
    return orderFilter === 'all' || label === orderFilter;
  }

  function sparkPath(values) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    return values.map((v, i) => ((i ? 'L' : 'M') + (2 + i * 10.8).toFixed(1) + ' ' + (27 - (v - min) / range * 23).toFixed(1))).join(' ');
  }

  function setSpark(id, values) {
    const el = $(id);
    if (el) el.setAttribute('d', sparkPath(values));
  }

  function setStats(stats) {
    const liveOrders = orders.length > 0;
    const completedOrders = orders.filter((o) => o.status === 'completed' || o.payment_status === 'paid');
    const totalRev = completedOrders.reduce((s, o) => s + Number(o.total || 0), 0);
    const totalOrdersCount = orders.length;
    const refundedCount = orders.filter((o) => o.status === 'refunded').length;
    const refundRate = totalOrdersCount > 0 ? (refundedCount / totalOrdersCount * 100).toFixed(1) : '0.0';

    if ($('revenueToday')) $('revenueToday').textContent = money(stats?.totalRevenue ?? (liveOrders ? totalRev : 28450));
    if ($('ordersToday')) $('ordersToday').textContent = String(stats?.totalOrders ?? (liveOrders ? totalOrdersCount : 24));
    if ($('newCustomers')) $('newCustomers').textContent = String(stats?.totalUsers ?? (users.length || 18));
    if ($('refundRate')) $('refundRate').textContent = (stats?.refundRate ?? refundRate) + '%';

    sampleSpark.slice(0, 2).forEach((v, i) => setSpark(i ? 'sparkOrders' : 'sparkRevenue', v));
    setSpark('sparkCustomers', sampleSpark[2]);
    setSpark('sparkRefund', sampleSpark[3]);

    ['revenueChange', 'ordersChange', 'customersChange', 'refundChange'].forEach((id, i) => {
      const el = $(id);
      if (el) {
        el.textContent = liveOrders ? ['Live catalog', 'Live records', 'Registered users', 'Status-based'][i] : ['+8.4%', '+12.5%', '+6.2%', 'Sample'][i];
        if (liveOrders) el.classList.add('neutral');
      }
    });

    if ($('sampleBanner')) $('sampleBanner').hidden = liveOrders;
    if ($('financialNote')) $('financialNote').textContent = 'Completed order value is derived from database orders and server pricing. Refund rate is calculated from refunded records.';
  }

  function renderChart(series, preview) {
    const svg = $('revenueChart');
    const tooltip = $('chartTooltip');
    if (!svg || !tooltip) return;
    const width = 800;
    const height = 250;
    const left = 24;
    const right = 20;
    const top = 18;
    const bottom = 26;
    const plotW = width - left - right;
    const plotH = height - top - bottom;

    const vals = series.map((x) => x.value);
    const peak = Math.max(1, ...vals);
    const floor = 0;
    const pts = series.map((d, i) => ({
      x: left + (series.length === 1 ? plotW / 2 : i * plotW / (series.length - 1)),
      y: top + plotH - (d.value - floor) / (peak || 1) * plotH,
      d
    }));

    svg.querySelectorAll('.chart-generated').forEach((n) => n.remove());
    const ns = 'http://www.w3.org/2000/svg';

    for (let k = 0; k < 4; k++) {
      const y = top + k * plotH / 3;
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', left);
      line.setAttribute('x2', width - right);
      line.setAttribute('y1', y);
      line.setAttribute('y2', y);
      line.setAttribute('class', 'chart-grid-line chart-generated');
      svg.append(line);
    }

    const area = document.createElementNS(ns, 'path');
    area.setAttribute('class', 'chart-area chart-generated');
    area.setAttribute('d', 'M ' + pts.map((p) => p.x + ' ' + p.y).join(' L ') + ' L ' + (width - right) + ' ' + (height - bottom) + ' L ' + left + ' ' + (height - bottom) + ' Z');
    svg.append(area);

    const path = document.createElementNS(ns, 'path');
    path.setAttribute('class', 'chart-line chart-generated');
    path.setAttribute('d', pts.map((p, i) => (i ? 'L' : 'M') + ' ' + p.x + ' ' + p.y).join(' '));
    svg.append(path);

    pts.forEach((p) => {
      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', p.x);
      c.setAttribute('cy', p.y);
      c.setAttribute('r', '5');
      c.setAttribute('class', 'chart-point chart-generated');
      c.setAttribute('tabindex', '0');
      c.setAttribute('aria-label', p.d.label + ': ' + money(p.d.value));

      const show = (event) => {
        tooltip.hidden = false;
        tooltip.innerHTML = '<strong>' + safe(p.d.label) + '</strong>' + money(p.d.value) + (preview ? '<br>Sample preview' : '');
        const box = svg.getBoundingClientRect();
        const clientX = event.clientX || box.left + p.x / width * box.width;
        const clientY = event.clientY || box.top + p.y / height * box.height;
        tooltip.style.left = Math.max(0, Math.min(box.width - 145, clientX - box.left + 8)) + 'px';
        tooltip.style.top = Math.max(0, clientY - box.top - 55) + 'px';
      };

      c.addEventListener('mouseenter', show);
      c.addEventListener('focus', show);
      c.addEventListener('mouseleave', () => { tooltip.hidden = true; });
      c.addEventListener('blur', () => { tooltip.hidden = true; });
      c.addEventListener('mousemove', show);
      svg.append(c);
    });

    const total = series.reduce((s, x) => s + x.value, 0);
    if ($('chartTotal')) $('chartTotal').textContent = money(total);
    if ($('chartCaption')) $('chartCaption').textContent = (days === 365 ? 'Last 12 months' : ('Last ' + days + ' days')) + (preview ? ' · sample preview' : ' · completed order revenue');

    const labs = $('chartLabels');
    if (labs) {
      labs.innerHTML = '';
      const stride = series.length > 12 ? Math.ceil(series.length / 6) : 1;
      series.forEach((p, i) => {
        if (i % stride === 0 || i === series.length - 1) {
          const span = document.createElement('span');
          span.textContent = p.label;
          labs.append(span);
        }
      });
    }
  }

  const donutColors = ['#d4af5a', '#6d9475', '#8b7952', '#577262', '#b5894a', '#3e715d'];

  function renderMix(rows, preview) {
    const values = rows.length ? rows.map((x) => ({ name: x.category || x.name, value: Number(x.value || x.completedOrderValue || 0) })) : sampleMix.map((x) => ({ name: x.category, value: x.value }));
    const total = values.reduce((s, x) => s + x.value, 0) || 1;
    let current = 0;
    const stops = [];

    values.forEach((v, i) => {
      const start = current / total * 100;
      current += v.value;
      stops.push(donutColors[i % donutColors.length] + ' ' + start.toFixed(2) + '% ' + (current / total * 100).toFixed(2) + '%');
    });

    if ($('salesDonut')) $('salesDonut').style.background = 'conic-gradient(' + stops.join(',') + ')';
    if ($('donutTotal')) $('donutTotal').textContent = preview ? 'Sample' : (Math.round(total > 0 ? 100 : 0) + '%');
    if ($('salesLegend')) {
      $('salesLegend').innerHTML = values.slice(0, 6).map((v, i) => '<div class="legend-row"><span class="legend-dot" style="background:' + donutColors[i % donutColors.length] + '"></span><span>' + safe(v.name) + '</span><strong>' + Math.round(v.value / total * 100) + '%</strong></div>').join('');
    }
  }

  function renderTopProducts() {
    const activeProducts = products.filter((p) => p.status !== 'archived');
    if ($('topProducts')) {
      $('topProducts').innerHTML = activeProducts.slice(0, 5).map((p) => {
        const stock = Math.max(0, Number(p.stock || 0));
        const width = Math.max(3, Math.min(100, stock / 40 * 100));
        const costStr = p.product_costs?.cost_price ? ' · Cost: ' + money(p.product_costs.cost_price) : '';
        return '<div class="top-product">'
          + '<img class="product-thumb" src="' + safe(p.image_url || '/assets/dia-editorial.webp') + '" alt="">'
          + '<div class="product-name"><strong>' + safe(p.name) + '</strong><small>' + safe(p.category || 'Dia selection') + costStr + '</small></div>'
          + '<div class="product-metric"><strong>' + money(p.price) + '</strong>' + stock + ' in stock</div>'
          + '<div class="stock-cell"><div class="stock-label"><span>Stock</span><b>' + stock + ' left</b></div><div class="stock-bar"><span class="' + (stock <= 5 ? 'low' : '') + '" style="width:' + width + '%"></span></div></div>'
          + '</div>';
      }).join('');
    }
    if ($('productSource')) $('productSource').textContent = 'Live catalog';
  }

  function renderInventory() {
    const body = $('inventoryRows');
    if (!body) return;
    if (!products.length) {
      body.innerHTML = '<tr><td colspan="6">No products match this search. Add your first Dia product above.</td></tr>';
      return;
    }

    body.innerHTML = products.map((p) => {
      const costInfo = p.product_costs?.cost_price != null ? ' · Cost: ' + money(p.product_costs.cost_price) : '';
      return '<tr>'
        + '<td><strong>' + safe(p.name) + '</strong><small>' + safe(p.color || '') + costInfo + '</small></td>'
        + '<td>' + safe(p.category) + '</td>'
        + '<td>' + money(p.price) + '</td>'
        + '<td>' + Number(p.stock || 0) + '</td>'
        + '<td><span class="status ' + (p.status === 'archived' ? 'refunded' : '') + '">' + safe(p.status) + '</span></td>'
        + '<td><button type="button" class="manager-button" data-edit-product="' + safe(p.id) + '">Edit</button> '
        + '<button type="button" class="manager-button danger" data-toggle-product="' + safe(p.id) + '">' + (p.status === 'active' ? 'Archive' : 'Restore') + '</button></td>'
        + '</tr>';
    }).join('');

    body.querySelectorAll('[data-edit-product]').forEach((button) => button.addEventListener('click', () => {
      fillProductForm(products.find((p) => String(p.id) === button.dataset.editProduct));
    }));
    body.querySelectorAll('[data-toggle-product]').forEach((button) => button.addEventListener('click', () => {
      toggleProduct(products.find((p) => String(p.id) === button.dataset.toggleProduct));
    }));
  }

  function clearProductForm() {
    $('productForm').reset();
    $('productId').value = '';
    $('productColor').value = 'Forest';
    $('productTag').value = 'New arrival';
    $('productStock').value = '0';
    $('productImage').value = '/assets/dia-editorial.webp';
    if ($('productImagePreview')) $('productImagePreview').src = '/assets/dia-editorial.webp';
    $('productPosition').value = 'center center';
    $('saveProductButton').textContent = 'Save product';
    $('productMessage').textContent = 'Add a new piece to the live Supabase catalog.';
  }

  function fillProductForm(product) {
    if (!product) return;
    $('productId').value = product.id;
    $('productName').value = product.name;
    $('productCategory').value = product.category;
    $('productDescription').value = product.description || '';
    $('productPrice').value = product.price;
    $('productCostPrice').value = product.product_costs?.cost_price ?? '';
    $('productStock').value = product.stock;
    $('productColor').value = product.color || 'Forest';
    $('productSizes').value = Array.isArray(product.sizes) ? product.sizes.join(', ') : '';
    $('productTag').value = product.tag || 'New arrival';
    $('productImage').value = product.image_url || '/assets/dia-editorial.webp';
    if ($('productImagePreview')) $('productImagePreview').src = product.image_url || '/assets/dia-editorial.webp';
    $('productPosition').value = product.image_position || 'center center';
    $('saveProductButton').textContent = 'Save changes';
    $('productMessage').textContent = 'Editing ' + product.name + '.';
    $('productForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function saveProduct(event) {
    event.preventDefault();
    const id = $('productId').value.trim();
    const button = $('saveProductButton');
    button.disabled = true;
    $('productMessage').textContent = '';

    const name = $('productName').value.trim();
    const category = $('productCategory').value.trim();
    const description = $('productDescription').value.trim();
    const price = Number($('productPrice').value);
    const costPriceRaw = $('productCostPrice').value.trim();
    const costPrice = costPriceRaw === '' ? null : Number(costPriceRaw);
    const stock = Number($('productStock').value);
    const color = $('productColor').value.trim();
    const sizes = $('productSizes').value.split(',').map((v) => v.trim()).filter(Boolean);
    const tag = $('productTag').value.trim();
    const image_url = $('productImage').value.trim();
    const image_position = $('productPosition').value.trim() || 'center center';

    try {
      const sb = window.getSupabase();
      let targetId = id;

      if (!targetId) {
        // Generate slug ID
        targetId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const { error: insertError } = await sb.from('products').insert({
          id: targetId,
          name,
          category,
          description,
          price,
          color,
          sizes,
          image_url,
          image_position,
          tag,
          stock,
          status: 'active',
          sort_order: products.length + 1
        });
        if (insertError) throw insertError;
      } else {
        const { error: updateError } = await sb.from('products').update({
          name,
          category,
          description,
          price,
          color,
          sizes,
          image_url,
          image_position,
          tag,
          stock
        }).eq('id', targetId);
        if (updateError) throw updateError;
      }

      // Upsert product_costs if provided
      if (costPrice !== null) {
        await sb.from('product_costs').upsert({
          product_id: targetId,
          cost_price: costPrice
        }, { onConflict: 'product_id' });
      }

      $('productMessage').textContent = id ? 'Product updated successfully.' : 'Product added to the catalog.';
      clearProductForm();
      await loadProducts($('globalSearch')?.value?.trim());
    } catch (error) {
      $('productMessage').textContent = error.message || 'Could not save product.';
    } finally {
      button.disabled = false;
    }
  }

  async function toggleProduct(product) {
    if (!product) return;
    try {
      const sb = window.getSupabase();
      const nextStatus = product.status === 'active' ? 'archived' : 'active';
      const { error } = await sb.from('products').update({ status: nextStatus }).eq('id', product.id);
      if (error) throw error;
      $('productMessage').textContent = nextStatus === 'archived' ? 'Product archived.' : 'Product restored.';
      await loadProducts($('globalSearch')?.value?.trim());
    } catch (error) {
      $('productMessage').textContent = error.message || 'Could not change product status.';
    }
  }

  function renderOrders() {
    const rows = orders.filter(orderMatchesFilter);
    const body = $('orderRows');
    if (!body) return;

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px">No orders found matching this filter.</td></tr>';
      if ($('ordersEmpty')) $('ordersEmpty').hidden = false;
      return;
    }
    if ($('ordersEmpty')) $('ordersEmpty').hidden = true;

    const transitions = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['processing', 'cancelled'],
      processing: ['shipped', 'cancelled'],
      shipped: ['completed', 'refunded'],
      completed: ['refunded'],
      cancelled: [],
      refunded: []
    };

    body.innerHTML = rows.map((o) => {
      const label = statusFor(o);
      const date = dateLabel(o.created_at || o.createdAt);
      const curStatus = (o.status || 'pending').toLowerCase();
      const next = transitions[curStatus] || ['confirmed', 'processing', 'shipped', 'completed', 'cancelled'];
      const orderNum = o.order_number || o.orderNumber || ('DIA-' + String(o.id).slice(0, 8).toUpperCase());
      const custName = o.customer_name || o.customerName || 'Customer';
      const custEmail = o.customer_email || o.customerEmail || '—';

      const options = !next.length
        ? '<span>—</span>'
        : '<select class="order-action" data-order-action="' + safe(o.id) + '" aria-label="Update order ' + safe(orderNum) + '">'
          + '<option value="">Update status</option>'
          + next.map((s) => '<option value="' + s + '">' + s.charAt(0).toUpperCase() + s.slice(1) + '</option>').join('')
          + '<option value="paid">Mark as Paid</option>'
          + '</select>';

      return '<tr>'
        + '<td><strong>' + safe(orderNum) + '</strong><small>' + safe(o.status || 'pending') + '</small></td>'
        + '<td><strong>' + safe(custName) + '</strong><small>' + safe(custEmail) + '</small></td>'
        + '<td>' + date + '</td>'
        + '<td><strong>' + money(o.total) + '</strong></td>'
        + '<td><span class="status ' + statusClass(label) + '">' + label + '</span></td>'
        + '<td>' + options + '</td>'
        + '</tr>';
    }).join('');

    body.querySelectorAll('[data-order-action]').forEach((select) => select.addEventListener('change', async () => {
      const val = select.value;
      if (!val) return;
      select.disabled = true;

      try {
        const sb = window.getSupabase();
        const orderId = select.dataset.orderAction;
        const updatePayload = {};

        if (val === 'paid') {
          updatePayload.payment_status = 'paid';
        } else {
          updatePayload.status = val;
          if (val === 'completed') updatePayload.payment_status = 'paid';
        }

        const { error } = await sb.from('orders').update(updatePayload).eq('id', orderId);
        if (error) throw error;

        await loadOrders($('globalSearch')?.value?.trim());
        await loadStats();
      } catch (error) {
        showError(error.message || 'Could not update order status.');
        select.disabled = false;
      }
    }));

    if ($('ordersSource')) $('ordersSource').textContent = 'Live order records';
  }

  function renderCustomers() {
    const list = $('customerList');
    if (!list) return;

    if (!users.length) {
      list.innerHTML = '<div class="customer-card"><span class="customer-avatar">D</span><span><strong>No users yet</strong><small>Customer signups will appear here.</small></span></div>';
      return;
    }

    list.innerHTML = users.slice(0, 10).map((u) => {
      const initial = safe((u.name || u.email || 'D').slice(0, 1).toUpperCase());
      const roleBadge = u.role === 'admin' ? ' · 👑 Admin' : ' · Customer';
      return '<div class="customer-card">'
        + '<span class="customer-avatar">' + initial + '</span>'
        + '<span><strong>' + safe(u.name || 'Dia customer') + '</strong><small>' + safe(u.email || '') + roleBadge + ' · ' + safe(u.status || 'active') + '</small></span>'
        + (u.id !== adminUser?.id
          ? '<div style="display:flex;gap:6px">'
            + '<button type="button" class="customer-action" data-toggle-role="' + safe(u.id) + '" data-next-role="' + (u.role === 'admin' ? 'user' : 'admin') + '">' + (u.role === 'admin' ? 'Demote' : 'Promote') + '</button>'
            + '<button type="button" class="customer-action" data-customer-id="' + safe(u.id) + '" data-next-status="' + (u.status === 'active' ? 'disabled' : 'active') + '">' + (u.status === 'active' ? 'Disable' : 'Enable') + '</button>'
            + '</div>'
          : '<small style="color:var(--gold-hi);align-self:center;font-size:10px">You</small>')
        + '</div>';
    }).join('');

    // Status change listener
    list.querySelectorAll('[data-customer-id]').forEach((button) => button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const sb = window.getSupabase();
        const { error } = await sb.from('profiles').update({ status: button.dataset.nextStatus }).eq('id', button.dataset.customerId);
        if (error) throw error;
        await loadCustomers();
        await loadStats();
      } catch (error) {
        showError(error.message || 'Could not change user status.');
        button.disabled = false;
      }
    }));

    // Role change listener (promote / demote)
    list.querySelectorAll('[data-toggle-role]').forEach((button) => button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const sb = window.getSupabase();
        const { error } = await sb.from('profiles').update({ role: button.dataset.nextRole }).eq('id', button.dataset.toggleRole);
        if (error) throw error;
        await loadCustomers();
        await loadStats();
      } catch (error) {
        showError(error.message || 'Could not change user role.');
        button.disabled = false;
      }
    }));
  }

  function updatePage(link) {
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === link.dataset.nav));
    const label = link.dataset.nav;
    const title = {
      overview: 'Good day, welcome back.',
      orders: 'Orders and fulfillment.',
      products: 'Products and inventory.',
      customers: 'Your Dia community.',
      analytics: 'Analytics and performance.',
      settings: 'Studio settings.'
    };
    if ($('pageTitle')) $('pageTitle').textContent = title[label] || 'Dia studio';
    if ($('pageEyebrow')) $('pageEyebrow').textContent = 'Dia studio / ' + label;
  }

  document.querySelectorAll('[data-nav]').forEach((link) => link.addEventListener('click', () => updatePage(link)));

  if ($('orderFilters')) {
    $('orderFilters').addEventListener('click', (event) => {
      const btn = event.target.closest('[data-filter]');
      if (!btn) return;
      orderFilter = btn.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach((x) => x.classList.toggle('active', x === btn));
      renderOrders();
    });
  }

  async function loadOrders(searchValue) {
    try {
      const sb = window.getSupabase();
      let query = sb.from('orders').select('*, order_items(*)').order('created_at', { ascending: false });

      if (searchValue) {
        query = query.or(`customer_name.ilike.%${searchValue}%,customer_email.ilike.%${searchValue}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      orders = data || [];
      renderOrders();
    } catch (error) {
      console.warn('[Dia] Admin load orders error:', error);
      orders = [];
      renderOrders();
    }
  }

  async function loadProducts(searchValue) {
    try {
      const sb = window.getSupabase();
      let query = sb.from('products').select('*, product_costs(cost_price)').order('sort_order', { ascending: true });

      if (searchValue) {
        query = query.or(`name.ilike.%${searchValue}%,category.ilike.%${searchValue}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      products = data || [];
      renderTopProducts();
      renderInventory();
    } catch (error) {
      console.warn('[Dia] Admin load products error:', error);
      products = [];
      renderTopProducts();
      renderInventory();
    }
  }

  async function loadCustomers() {
    try {
      const sb = window.getSupabase();
      const { data, error } = await sb.from('profiles').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      users = data || [];
      renderCustomers();
    } catch (error) {
      console.warn('[Dia] Admin load customers error:', error);
      users = [];
      renderCustomers();
    }
  }

  async function loadStats() {
    try {
      const sb = window.getSupabase();
      const { data, error } = await sb.rpc('admin_stats');
      if (error) throw error;
      analyticsStats = data;
      setStats(data);
      return data;
    } catch (error) {
      console.warn('[Dia] Admin stats RPC error (using table aggregates):', error);
      setStats(null);
      return null;
    }
  }

  function loadAnalytics(period) {
    days = period;
    const series = period === 7
      ? sampleRevenue.map((v, i) => ({ key: 'sample-' + i, label: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i], value: v }))
      : period === 30
        ? Array.from({ length: 30 }, (_, i) => ({ key: 'sample-' + i, label: String(i + 1), value: 11000 + Math.round((Math.sin(i / 2) + 1) * 4800) + (i % 5) * 900 }))
        : Array.from({ length: 12 }, (_, i) => ({ key: 'sample-' + i, label: ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'][i], value: 115000 + i * 4800 + Math.round(Math.sin(i * 1.5) * 18000) }));

    renderChart(series, true);
    renderMix([], true);
  }

  if ($('globalSearch')) {
    $('globalSearch').addEventListener('input', () => {
      clearTimeout(searchTimer);
      const value = $('globalSearch').value.trim();
      searchTimer = setTimeout(() => {
        loadOrders(value);
        loadProducts(value);
      }, 260);
    });
  }

  if ($('productForm')) $('productForm').addEventListener('submit', saveProduct);
  if ($('resetProductForm')) $('resetProductForm').addEventListener('click', clearProductForm);

  if ($('productImage')) {
    $('productImage').addEventListener('input', () => {
      if ($('productImagePreview')) $('productImagePreview').src = $('productImage').value.trim() || '/assets/dia-editorial.webp';
    });
  }

  if ($('newProductButton')) {
    $('newProductButton').addEventListener('click', () => {
      clearProductForm();
      $('productForm')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      $('productName')?.focus();
    });
  }

  document.querySelectorAll('[data-range]').forEach((btn) => btn.addEventListener('click', () => {
    document.querySelectorAll('[data-range]').forEach((x) => x.classList.toggle('active', x === btn));
    loadAnalytics(Number(btn.dataset.range));
  }));

  // Hero slideshow in admin
  function showSlide(next) {
    slide = (next + slides.length) % slides.length;
    if ($('heroTrack')) $('heroTrack').style.transform = 'translateX(-' + slide * 100 + '%)';
    dots.forEach((d, i) => d.setAttribute('aria-current', String(i === slide)));
    const p = $('heroProgress');
    if (p) {
      p.classList.remove('run');
      void p.offsetWidth;
      if (!reduced && !paused) p.classList.add('run');
    }
  }

  function stopSlider() {
    clearTimeout(slideTimer);
    slideTimer = null;
    const p = $('heroProgress');
    if (p) p.classList.remove('run');
  }

  function startSlider() {
    stopSlider();
    if (reduced || paused) return;
    const p = $('heroProgress');
    if (p) {
      p.classList.remove('run');
      void p.offsetWidth;
      p.classList.add('run');
    }
    slideTimer = setTimeout(() => {
      showSlide(slide + 1);
      startSlider();
    }, 4000);
  }

  if ($('heroDots')) {
    $('heroDots').addEventListener('click', (event) => {
      const b = event.target.closest('[data-slide]');
      if (b) {
        showSlide(Number(b.dataset.slide));
        startSlider();
      }
    });
  }

  if ($('dashboardHero')) {
    $('dashboardHero').addEventListener('mouseenter', () => { paused = true; stopSlider(); });
    $('dashboardHero').addEventListener('mouseleave', () => { paused = false; startSlider(); });
  }

  if ($('logoutButton')) {
    $('logoutButton').addEventListener('click', async () => {
      const btn = $('logoutButton');
      btn.disabled = true;
      try {
        const sb = window.diaSupabase || (typeof window.getDiaSupabase === 'function' ? window.getDiaSupabase() : window.getSupabase());
        if (sb && sb.auth) {
          await sb.auth.signOut();
        }
      } catch {}
      window.location.assign('/admin/login');
    });
  }

  if ($('dashboardDate')) $('dashboardDate').textContent = new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  if ($('currentDate')) $('currentDate').textContent = new Date().toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  // Main Boot
  async function boot() {
    try {
      const sb = window.diaSupabase || (typeof window.getDiaSupabase === 'function' ? window.getDiaSupabase() : window.getSupabase());
      if (!sb || !sb.auth) {
        throw new Error('Supabase client is not available in admin dashboard.');
      }
      const { data: { session } } = await sb.auth.getSession();
      if (!session?.user) {
        window.location.replace('/admin/login');
        return;
      }

      adminUser = session.user;
      const { data: profile, error } = await sb
        .from('profiles')
        .select('*')
        .eq('id', adminUser.id)
        .single();

      if (error || !profile || profile.role !== 'admin' || profile.status !== 'active') {
        await sb.auth.signOut();
        window.location.replace('/admin/login');
        return;
      }

      adminProfile = profile;
      if ($('adminName')) $('adminName').textContent = profile.name || 'Administrator';
      if ($('adminInitial')) $('adminInitial').textContent = (profile.name || 'D').slice(0, 1).toUpperCase();

      await Promise.all([loadStats(), loadOrders(), loadProducts(), loadCustomers()]);
      loadAnalytics(7);
      startSlider();
    } catch (error) {
      console.error('[Dia] Admin boot error:', error);
      window.location.replace('/admin/login');
    }
  }

  boot();
})();
