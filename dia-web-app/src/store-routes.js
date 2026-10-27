'use strict';

const crypto = require('node:crypto');

const MAX_PRICE = 100000000;
const MAX_STOCK = 1000000;
const LOW_STOCK_LIMIT = 5;
const FREE_SHIPPING_THRESHOLD = 2500;
const SHIPPING_FEE = 120;

function apiError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}
function jsonArray(value, fallback = []) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}
function publicProduct(row, includeCost = false) {
  const product = {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    price: row.price,
    color: row.color,
    sizes: jsonArray(row.sizes_json),
    image: row.image_url,
    position: row.image_position,
    tag: row.tag,
    stock: row.stock,
    status: row.status,
    isSample: row.is_sample === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  // Product cost is business-sensitive and is returned only to an authorized administrator.
  if (includeCost) product.costPrice = row.cost_price ?? null;
  return product;
}
function publicOrder(row) {
  return {
    id: row.id,
    orderNumber: row.order_number,
    userId: row.user_id,
    status: row.status,
    paymentStatus: row.payment_status,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    shippingAddress: row.shipping_address,
    subtotal: row.subtotal,
    shipping: row.shipping,
    total: row.total,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
function parseSizes(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return null;
}
function productInput(body, current = null) {
  const source = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const currentSizes = current ? jsonArray(current.sizes_json) : [];
  const values = {
    name: Object.hasOwn(source, 'name') ? source.name : current?.name,
    category: Object.hasOwn(source, 'category') ? source.category : current?.category,
    description: Object.hasOwn(source, 'description') ? source.description : (current?.description ?? ''),
    price: Object.hasOwn(source, 'price') ? source.price : current?.price,
    costPrice: Object.hasOwn(source, 'costPrice') ? source.costPrice : (current?.cost_price ?? null),
    color: Object.hasOwn(source, 'color') ? source.color : (current?.color ?? 'Mixed'),
    sizes: Object.hasOwn(source, 'sizes') ? parseSizes(source.sizes) : currentSizes,
    image: Object.hasOwn(source, 'image') ? source.image : (current?.image_url ?? '/assets/dia-editorial.webp'),
    imagePosition: Object.hasOwn(source, 'imagePosition') ? source.imagePosition : (current?.image_position ?? 'center center'),
    tag: Object.hasOwn(source, 'tag') ? source.tag : (current?.tag ?? 'New arrival'),
    stock: Object.hasOwn(source, 'stock') ? source.stock : current?.stock
  };
  const requiredText = [['name', 2, 120], ['category', 2, 60], ['color', 1, 80], ['tag', 1, 40]];
  for (const [field, min, max] of requiredText) {
    if (typeof values[field] !== 'string' || values[field].trim().length < min || values[field].trim().length > max) {
      return { error: { code: 'INVALID_PRODUCT_FIELD', message: 'Check the product ' + field + ' field.' } };
    }
    values[field] = values[field].trim();
  }
  if (typeof values.description !== 'string' || values.description.length > 3000) {
    return { error: { code: 'INVALID_PRODUCT_DESCRIPTION', message: 'Product description must be 3000 characters or fewer.' } };
  }
  if (!Number.isSafeInteger(values.price) || values.price < 0 || values.price > MAX_PRICE) {
    return { error: { code: 'INVALID_PRODUCT_PRICE', message: 'Price must be a whole-number PHP amount from 0 to 100,000,000.' } };
  }
  if (values.costPrice !== null && (!Number.isSafeInteger(values.costPrice) || values.costPrice < 0 || values.costPrice > MAX_PRICE)) {
    return { error: { code: 'INVALID_PRODUCT_COST', message: 'Cost price must be a whole-number PHP amount or left blank.' } };
  }
  if (!Number.isSafeInteger(values.stock) || values.stock < 0 || values.stock > MAX_STOCK) {
    return { error: { code: 'INVALID_PRODUCT_STOCK', message: 'Stock must be a whole number from 0 to 1,000,000.' } };
  }
  if (!Array.isArray(values.sizes) || values.sizes.length < 1 || values.sizes.length > 20 ||
      values.sizes.some((size) => typeof size !== 'string' || size.trim().length < 1 || size.trim().length > 20) ||
      new Set(values.sizes.map((size) => size.trim().toLowerCase())).size !== values.sizes.length) {
    return { error: { code: 'INVALID_PRODUCT_SIZES', message: 'Provide one or more unique sizes, separated by commas.' } };
  }
  values.sizes = values.sizes.map((size) => size.trim());
  if (typeof values.image !== 'string' || values.image.length > 2048 ||
      !(values.image.startsWith('/assets/') || /^https:\/\//i.test(values.image))) {
    return { error: { code: 'INVALID_PRODUCT_IMAGE', message: 'Image must be an /assets/ path or an HTTPS URL.' } };
  }
  if (typeof values.imagePosition !== 'string' || values.imagePosition.length > 40 || !/^[a-zA-Z0-9% .-]+$/.test(values.imagePosition)) {
    return { error: { code: 'INVALID_IMAGE_POSITION', message: 'Image position contains unsupported characters.' } };
  }
  return { value: values };
}
function cartRows(db, userId) {
  return db.prepare(
    "SELECT ci.product_id,ci.size,ci.quantity,p.name,p.category,p.price,p.color,p.sizes_json,p.image_url,p.image_position,p.stock,p.status " +
    "FROM cart_items ci JOIN products p ON p.id=ci.product_id WHERE ci.user_id=? AND p.status='active' ORDER BY ci.created_at"
  ).all(userId);
}
function cartResult(db, userId) {
  const rows = cartRows(db, userId);
  const items = rows.map((row) => ({
    productId: row.product_id, size: row.size, quantity: row.quantity, name: row.name,
    category: row.category, price: row.price, color: row.color, image: row.image_url,
    position: row.image_position, stock: row.stock
  }));
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return { items, summary: { itemCount: items.reduce((sum, item) => sum + item.quantity, 0), subtotal } };
}
function safeOrderItems(db, orderId) {
  return db.prepare(
    'SELECT id,product_id AS productId,product_name AS name,category,size,quantity,unit_price AS unitPrice,unit_cost AS unitCost,line_total AS lineTotal FROM order_items WHERE order_id=? ORDER BY rowid'
  ).all(orderId);
}
function makeOrderNumber() {
  return 'DIA-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}
function routeError(res, error) {
  if (error && Number.isInteger(error.status)) {
    return apiError(res, error.status, error.code || 'REQUEST_FAILED', error.message);
  }
  console.error('Store API operation failed:', error?.code || error?.name || 'UNKNOWN_ERROR');
  return apiError(res, 500, 'STORE_OPERATION_FAILED', 'The store could not complete that operation. Please try again.');
}
function storeError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function registerStoreRoutes(app, { db, auth, admin, csrf }) {
  app.get('/api/categories', (_req, res) => {
    const categories = db.prepare("SELECT category,COUNT(*) AS productCount FROM products WHERE status='active' GROUP BY category ORDER BY category").all();
    res.json({ categories: categories.map((row) => ({ name: row.category, productCount: row.productCount })) });
  });

  app.get('/api/products', (req, res) => {
    const clauses = ["status='active'"];
    const params = [];
    const search = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    const category = typeof req.query.category === 'string' ? req.query.category.trim().slice(0, 60) : '';
    if (search) {
      clauses.push('(name LIKE ? OR category LIKE ? OR description LIKE ? OR color LIKE ? OR tag LIKE ?)');
      const value = '%' + search + '%';
      params.push(value, value, value, value, value);
    }
    if (category && category !== 'All') {
      clauses.push('category=?');
      params.push(category);
    }
    if (req.query.minPrice !== undefined && req.query.minPrice !== '') {
      const min = Number(req.query.minPrice);
      if (!Number.isSafeInteger(min) || min < 0) return apiError(res, 400, 'INVALID_MIN_PRICE', 'Minimum price must be a non-negative whole number.');
      clauses.push('price>=?'); params.push(min);
    }
    if (req.query.maxPrice !== undefined && req.query.maxPrice !== '') {
      const max = Number(req.query.maxPrice);
      if (!Number.isSafeInteger(max) || max < 0) return apiError(res, 400, 'INVALID_MAX_PRICE', 'Maximum price must be a non-negative whole number.');
      clauses.push('price<=?'); params.push(max);
    }
    const orderBy = ({
      'price-asc': 'price ASC,name ASC',
      'price-desc': 'price DESC,name ASC',
      newest: 'created_at DESC',
      name: 'name COLLATE NOCASE ASC'
    })[req.query.sort] || 'tag ASC,name ASC';
    const rows = db.prepare('SELECT * FROM products WHERE ' + clauses.join(' AND ') + ' ORDER BY ' + orderBy).all(...params);
    res.json({ products: rows.map((row) => publicProduct(row, true)) });
  });

  app.get('/api/products/:id', (req, res) => {
    const row = db.prepare("SELECT * FROM products WHERE id=? AND status='active'").get(String(req.params.id).slice(0, 100));
    if (!row) return apiError(res, 404, 'PRODUCT_NOT_FOUND', 'That product is unavailable.');
    return res.json({ product: publicProduct(row) });
  });

  app.get('/api/cart', auth, (req, res) => res.json(cartResult(db, req.user.id)));

  app.post('/api/cart/items', csrf, auth, (req, res) => {
    const productId = typeof req.body?.productId === 'string' ? req.body.productId : '';
    const size = typeof req.body?.size === 'string' ? req.body.size.trim() : '';
    const quantity = req.body?.quantity === undefined ? 1 : req.body.quantity;
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) {
      return apiError(res, 400, 'INVALID_QUANTITY', 'Quantity must be a whole number between 1 and 99.');
    }
    const product = db.prepare("SELECT * FROM products WHERE id=? AND status='active'").get(productId);
    if (!product) return apiError(res, 404, 'PRODUCT_NOT_FOUND', 'That product is unavailable.');
    if (!jsonArray(product.sizes_json).includes(size)) return apiError(res, 400, 'INVALID_PRODUCT_SIZE', 'Choose a valid size for this product.');
    if (product.stock < 1) return apiError(res, 409, 'OUT_OF_STOCK', 'This item is currently out of stock.');
    const existing = db.prepare('SELECT quantity FROM cart_items WHERE user_id=? AND product_id=? AND size=?').get(req.user.id, productId, size);
    if ((existing?.quantity || 0) + quantity > product.stock) return apiError(res, 409, 'INSUFFICIENT_STOCK', 'The requested quantity exceeds available stock.');
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO cart_items(user_id,product_id,size,quantity,created_at,updated_at) VALUES(?,?,?,?,?,?) ' +
      'ON CONFLICT(user_id,product_id,size) DO UPDATE SET quantity=excluded.quantity,updated_at=excluded.updated_at'
    ).run(req.user.id, productId, size, (existing?.quantity || 0) + quantity, now, now);
    return res.status(201).json(cartResult(db, req.user.id));
  });

  app.put('/api/cart/items', csrf, auth, (req, res) => {
    const productId = typeof req.body?.productId === 'string' ? req.body.productId : '';
    const size = typeof req.body?.size === 'string' ? req.body.size.trim() : '';
    const quantity = req.body?.quantity;
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 99) {
      return apiError(res, 400, 'INVALID_QUANTITY', 'Quantity must be a whole number from 0 to 99.');
    }
    const existing = db.prepare('SELECT quantity FROM cart_items WHERE user_id=? AND product_id=? AND size=?').get(req.user.id, productId, size);
    if (!existing) return apiError(res, 404, 'CART_ITEM_NOT_FOUND', 'That item is no longer in your bag.');
    if (quantity === 0) {
      db.prepare('DELETE FROM cart_items WHERE user_id=? AND product_id=? AND size=?').run(req.user.id, productId, size);
      return res.json(cartResult(db, req.user.id));
    }
    const product = db.prepare("SELECT stock,status FROM products WHERE id=?").get(productId);
    if (!product || product.status !== 'active') return apiError(res, 409, 'PRODUCT_UNAVAILABLE', 'That product is no longer available.');
    if (quantity > product.stock) return apiError(res, 409, 'INSUFFICIENT_STOCK', 'The requested quantity exceeds available stock.');
    db.prepare('UPDATE cart_items SET quantity=?,updated_at=? WHERE user_id=? AND product_id=? AND size=?')
      .run(quantity, new Date().toISOString(), req.user.id, productId, size);
    return res.json(cartResult(db, req.user.id));
  });

  app.delete('/api/cart/items', csrf, auth, (req, res) => {
    const productId = typeof req.body?.productId === 'string' ? req.body.productId : '';
    const size = typeof req.body?.size === 'string' ? req.body.size.trim() : '';
    db.prepare('DELETE FROM cart_items WHERE user_id=? AND product_id=? AND size=?').run(req.user.id, productId, size);
    return res.json(cartResult(db, req.user.id));
  });

  app.post('/api/orders', csrf, auth, (req, res) => {
    const name = typeof req.body?.customerName === 'string' ? req.body.customerName.trim().replace(/\s+/g, ' ') : '';
    const email = typeof req.body?.customerEmail === 'string' ? req.body.customerEmail.trim().toLowerCase() : '';
    const address = typeof req.body?.customerAddress === 'string' ? req.body.customerAddress.trim() : '';
    const idempotencyKey = typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey.trim() : '';
    if (name.length < 2 || name.length > 120) return apiError(res, 400, 'INVALID_CUSTOMER_NAME', 'Enter your full name.');
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return apiError(res, 400, 'INVALID_CUSTOMER_EMAIL', 'Enter a valid email address.');
    if (address.length < 6 || address.length > 500) return apiError(res, 400, 'INVALID_SHIPPING_ADDRESS', 'Enter a complete delivery address.');
    if (idempotencyKey.length > 128) return apiError(res, 400, 'INVALID_IDEMPOTENCY_KEY', 'Checkout reference is invalid.');

    try {
      const created = db.transaction(() => {
        if (idempotencyKey) {
          const previous = db.prepare('SELECT * FROM orders WHERE user_id=? AND idempotency_key=?').get(req.user.id, idempotencyKey);
          if (previous) return { order: publicOrder(previous), items: safeOrderItems(db, previous.id), duplicate: true };
        }
        const rows = cartRows(db, req.user.id);
        if (!rows.length) throw storeError(409, 'EMPTY_CART', 'Your bag is empty.');
        let subtotal = 0;
        for (const item of rows) {
          if (item.stock < item.quantity) throw storeError(409, 'INSUFFICIENT_STOCK', item.name + ' does not have enough stock to fulfill your bag.');
          if (!jsonArray(item.sizes_json).includes(item.size)) throw storeError(409, 'INVALID_PRODUCT_SIZE', 'A selected size is no longer available.');
          subtotal += item.price * item.quantity;
          if (!Number.isSafeInteger(subtotal)) throw storeError(400, 'ORDER_TOTAL_TOO_LARGE', 'The order total is outside the supported range.');
        }
        const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
        const total = subtotal + shipping;
        const orderId = crypto.randomUUID();
        const orderNumber = makeOrderNumber();
        const now = new Date().toISOString();
        db.prepare(
          "INSERT INTO orders(id,order_number,user_id,status,payment_status,customer_name,customer_email,shipping_address,subtotal,shipping,total,idempotency_key,created_at,updated_at) " +
          "VALUES(?,?,?,'pending','not_collected',?,?,?,?,?,?,?, ?,?)"
        ).run(orderId, orderNumber, req.user.id, name, email, address, subtotal, shipping, total, idempotencyKey || null, now, now);

        const insertItem = db.prepare(
          'INSERT INTO order_items(id,order_id,product_id,product_name,category,size,quantity,unit_price,unit_cost,line_total,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)'
        );
        const decrementStock = db.prepare("UPDATE products SET stock=stock-?,updated_at=? WHERE id=? AND status='active' AND stock>=?");
        for (const item of rows) {
          const update = decrementStock.run(item.quantity, now, item.product_id, item.quantity);
          if (update.changes !== 1) throw storeError(409, 'INSUFFICIENT_STOCK', item.name + ' stock changed while checking out. Refresh your bag and try again.');
          const product = db.prepare('SELECT cost_price FROM products WHERE id=?').get(item.product_id);
          insertItem.run(
            crypto.randomUUID(), orderId, item.product_id, item.name, item.category, item.size,
            item.quantity, item.price, product.cost_price, item.price * item.quantity, now
          );
        }
        db.prepare('DELETE FROM cart_items WHERE user_id=?').run(req.user.id);
        const order = db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
        return { order: publicOrder(order), items: safeOrderItems(db, orderId), duplicate: false };
      })();
      return res.status(created.duplicate ? 200 : 201).json({
        ...created,
        notice: 'This order is recorded for demonstration only. No payment was collected or processed.'
      });
    } catch (error) {
      return routeError(res, error);
    }
  });

  app.get('/api/orders', auth, (req, res) => {
    const orders = db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 100').all(req.user.id);
    return res.json({ orders: orders.map((row) => ({ ...publicOrder(row), items: safeOrderItems(db, row.id) })) });
  });

  app.get('/api/orders/:id', auth, (req, res) => {
    const row = db.prepare('SELECT * FROM orders WHERE id=? AND user_id=?').get(String(req.params.id).slice(0, 100), req.user.id);
    if (!row) return apiError(res, 404, 'ORDER_NOT_FOUND', 'That order was not found.');
    return res.json({ order: { ...publicOrder(row), items: safeOrderItems(db, row.id) } });
  });

  app.get('/api/admin/products', auth, admin, (req, res) => {
    const status = ['active', 'archived'].includes(req.query.status) ? req.query.status : '';
    const clauses = [];
    const params = [];
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
    if (status) { clauses.push('status=?'); params.push(status); }
    if (search) { clauses.push('(name LIKE ? OR category LIKE ?)'); params.push('%' + search + '%', '%' + search + '%'); }
    const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
    const rows = db.prepare('SELECT * FROM products' + where + ' ORDER BY created_at DESC').all(...params);
    return res.json({ products: rows.map(publicProduct) });
  });

  app.post('/api/admin/products', csrf, auth, admin, (req, res) => {
    const parsed = productInput(req.body);
    if (parsed.error) return apiError(res, 400, parsed.error.code, parsed.error.message);
    const p = parsed.value;
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    db.prepare(
      "INSERT INTO products(id,name,category,description,price,cost_price,color,sizes_json,image_url,image_position,tag,stock,status,is_sample,created_at,updated_at) " +
      "VALUES(?,?,?,?,?,?,?,?,?,?,?,?, 'active',0,?,?)"
    ).run(id, p.name, p.category, p.description, p.price, p.costPrice, p.color, JSON.stringify(p.sizes), p.image, p.imagePosition, p.tag, p.stock, now, now);
    const row = db.prepare('SELECT * FROM products WHERE id=?').get(id);
    return res.status(201).json({ product: publicProduct(row, true) });
  });

  app.patch('/api/admin/products/:id', csrf, auth, admin, (req, res) => {
    const id = String(req.params.id).slice(0, 100);
    const existing = db.prepare('SELECT * FROM products WHERE id=?').get(id);
    if (!existing) return apiError(res, 404, 'PRODUCT_NOT_FOUND', 'That product was not found.');
    const parsed = productInput(req.body, existing);
    if (parsed.error) return apiError(res, 400, parsed.error.code, parsed.error.message);
    const p = parsed.value;
    const now = new Date().toISOString();
    db.prepare(
      'UPDATE products SET name=?,category=?,description=?,price=?,cost_price=?,color=?,sizes_json=?,image_url=?,image_position=?,tag=?,stock=?,updated_at=? WHERE id=?'
    ).run(p.name, p.category, p.description, p.price, p.costPrice, p.color, JSON.stringify(p.sizes), p.image, p.imagePosition, p.tag, p.stock, now, id);
    return res.json({ product: publicProduct(db.prepare('SELECT * FROM products WHERE id=?').get(id), true) });
  });

  app.delete('/api/admin/products/:id', csrf, auth, admin, (req, res) => {
    const id = String(req.params.id).slice(0, 100);
    const existing = db.prepare('SELECT id FROM products WHERE id=? AND status=\'active\'').get(id);
    if (!existing) return apiError(res, 404, 'PRODUCT_NOT_FOUND', 'That active product was not found.');
    const now = new Date().toISOString();
    db.transaction(() => {
      db.prepare("UPDATE products SET status='archived',updated_at=? WHERE id=?").run(now, id);
      db.prepare('DELETE FROM cart_items WHERE product_id=?').run(id);
    })();
    return res.json({ ok: true, id, status: 'archived' });
  });

  app.get('/api/admin/orders', auth, admin, (req, res) => {
    const clauses = [];
    const params = [];
    const status = ['pending','confirmed','processing','shipped','completed','cancelled','refunded'].includes(req.query.status) ? req.query.status : '';
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
    if (status) { clauses.push('o.status=?'); params.push(status); }
    if (search) { clauses.push('(o.order_number LIKE ? OR o.customer_email LIKE ? OR o.customer_name LIKE ?)'); const q = '%' + search + '%'; params.push(q,q,q); }
    const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
    const rows = db.prepare(
      'SELECT o.*,u.email AS account_email FROM orders o JOIN users u ON u.id=o.user_id' + where + ' ORDER BY o.created_at DESC LIMIT 200'
    ).all(...params);
    return res.json({ orders: rows.map((row) => ({ ...publicOrder(row), accountEmail: row.account_email, items: safeOrderItems(db, row.id) })) });
  });

  app.patch('/api/admin/orders/:id', csrf, auth, admin, (req, res) => {
    const id = String(req.params.id).slice(0, 100);
    const nextStatus = req.body?.status;
    if (!['pending','confirmed','processing','shipped','completed','cancelled','refunded'].includes(nextStatus)) {
      return apiError(res, 400, 'INVALID_ORDER_STATUS', 'Choose a valid order status.');
    }
    try {
      const updated = db.transaction(() => {
        const order = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
        if (!order) throw storeError(404, 'ORDER_NOT_FOUND', 'That order was not found.');
        const transitions = {
          pending: ['confirmed','cancelled'],
          confirmed: ['processing','cancelled'],
          processing: ['shipped','cancelled'],
          shipped: ['completed','refunded'],
          completed: ['refunded'],
          cancelled: [],
          refunded: []
        };
        if (order.status === nextStatus) return order;
        if (!transitions[order.status].includes(nextStatus)) {
          throw storeError(409, 'INVALID_ORDER_TRANSITION', 'That order status transition is not allowed.');
        }
        const now = new Date().toISOString();
        if (nextStatus === 'cancelled') {
          const items = db.prepare('SELECT product_id,quantity FROM order_items WHERE order_id=? AND product_id IS NOT NULL').all(id);
          for (const item of items) db.prepare("UPDATE products SET stock=stock+?,updated_at=? WHERE id=?").run(item.quantity, now, item.product_id);
        }
        db.prepare('UPDATE orders SET status=?,updated_at=? WHERE id=?').run(nextStatus, now, id);
        return db.prepare('SELECT * FROM orders WHERE id=?').get(id);
      })();
      return res.json({ order: publicOrder(updated) });
    } catch (error) {
      return routeError(res, error);
    }
  });

  app.get('/api/admin/analytics', auth, admin, (req, res) => {
    const allowedDays = [7, 30, 90, 365];
    const days = allowedDays.includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    const start = new Date(Date.now() - (days - 1) * 86400000);
    start.setHours(0,0,0,0);
    const daily = db.prepare(
      "SELECT substr(created_at,1,10) AS day,COUNT(*) AS orderCount,COALESCE(SUM(total),0) AS completedOrderValue " +
      "FROM orders WHERE status='completed' AND created_at>=? GROUP BY substr(created_at,1,10) ORDER BY day"
    ).all(start.toISOString());
    const byCategory = db.prepare(
      "SELECT oi.category AS category,COALESCE(SUM(oi.quantity),0) AS units,COALESCE(SUM(oi.line_total),0) AS completedOrderValue " +
      "FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.status='completed' AND o.created_at>=? " +
      "GROUP BY oi.category ORDER BY completedOrderValue DESC"
    ).all(start.toISOString());
    const topProducts = db.prepare(
      "SELECT oi.product_name AS name,COALESCE(SUM(oi.quantity),0) AS units,COALESCE(SUM(oi.line_total),0) AS completedOrderValue " +
      "FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.status='completed' AND o.created_at>=? " +
      "GROUP BY oi.product_name ORDER BY units DESC,completedOrderValue DESC LIMIT 10"
    ).all(start.toISOString());
    const statusCounts = db.prepare('SELECT status,COUNT(*) AS count FROM orders GROUP BY status ORDER BY status').all();
    const recentOrders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 8').all().map(publicOrder);
    return res.json({
      periodDays: days, startDate: start.toISOString().slice(0,10),
      daily, byCategory, topProducts, statusCounts, recentOrders,
      paymentNotice: 'This application does not integrate a payment provider. Order totals are not evidence of money collected.'
    });
  });
}

module.exports = { registerStoreRoutes, publicProduct, publicOrder, cartResult };
