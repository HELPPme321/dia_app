'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { createDatabase } = require('../src/db');
const { createApp } = require('../src/server');
const { seedSampleProducts } = require('../scripts/seed-sample-products');

const customerPassword = 'A-real-customer-test-password-2026';
const adminPassword = 'An-admin-test-password-2026!';
const quiet = { log() {}, warn() {} };

async function csrf(agent) {
  const response = await agent.get('/api/auth/csrf').expect(200);
  return response.body.csrfToken;
}
async function registerCustomer(agent, email = 'shopper@example.net') {
  const token = await csrf(agent);
  return agent.post('/api/auth/register')
    .set('x-csrf-token', token)
    .send({ name: 'Test Shopper', email, password: customerPassword, confirmPassword: customerPassword })
    .expect(201);
}
async function adminSignIn(agent, db) {
  const now = new Date().toISOString();
  db.prepare("INSERT INTO users(id,email,password_hash,name,role,status,created_at,updated_at) VALUES('store-admin','store-admin@example.net',?,'Store Administrator','admin','active',?,?)")
    .run(bcrypt.hashSync(adminPassword, 4), now, now);
  const token = await csrf(agent);
  return agent.post('/api/auth/admin-login')
    .set('x-csrf-token', token)
    .send({ email: 'store-admin@example.net', password: adminPassword });
}

test('sample product seed is repeatable and never overwrites existing product edits', () => {
  const db = createDatabase(':memory:');
  try {
    const first = seedSampleProducts({ db, logger: quiet });
    assert.equal(first.created.length, 4);
    assert.equal(first.skipped.length, 0);
    const product = db.prepare('SELECT name,price,stock,is_sample,cost_price FROM products WHERE id=?').get('essential-hoodie');
    assert.equal(product.name, 'Essential Hoodie');
    assert.equal(product.price, 1890);
    assert.equal(product.stock, 12);
    assert.equal(product.is_sample, 1);
    assert.equal(product.cost_price, null);

    db.prepare("UPDATE products SET price=1750,stock=4 WHERE id='essential-hoodie'").run();
    const second = seedSampleProducts({ db, logger: quiet });
    assert.equal(second.created.length, 0);
    assert.equal(second.skipped.length, 4);
    const unchanged = db.prepare('SELECT price,stock FROM products WHERE id=?').get('essential-hoodie');
    assert.deepEqual(unchanged, { price: 1750, stock: 4 });
  } finally {
    db.close();
  }
});

test('customer signup, DB cart, stock-safe demo order, order history, and admin analytics work end to end', async () => {
  const db = createDatabase(':memory:');
  try {
    seedSampleProducts({ db, logger: quiet });
    const { app } = createApp({ db, env: { NODE_ENV: 'test', APP_ORIGIN: 'http://localhost:3000' } });

    // Signup uses the actual /api/auth/register endpoint and inserts a normal user record.
    const customer = request.agent(app);
    const registered = await registerCustomer(customer);
    assert.equal(registered.body.user.role, 'user');
    assert.equal(db.prepare('SELECT role FROM users WHERE email=?').get('shopper@example.net').role, 'user');

    const catalog = await customer.get('/api/products?q=hoodie').expect(200);
    assert.equal(catalog.body.products.length, 1);
    assert.equal(catalog.body.products[0].id, 'essential-hoodie');
    assert.equal(Object.hasOwn(catalog.body.products[0], 'costPrice'), false);
    const categories = await customer.get('/api/categories').expect(200);
    assert.ok(categories.body.categories.some((category) => category.name === 'Tops'));

    // The cart belongs to the authenticated user and quantities are validated by the server.
    let token = await csrf(customer);
    await customer.post('/api/cart/items').set('x-csrf-token', token)
      .send({ productId: 'essential-hoodie', size: 'M', quantity: 1 }).expect(201);
    token = await csrf(customer);
    await customer.post('/api/cart/items').set('x-csrf-token', token)
      .send({ productId: 'everyday-tee', size: 'L', quantity: 2 }).expect(201);
    const bag = await customer.get('/api/cart').expect(200);
    assert.equal(bag.body.summary.itemCount, 3);
    assert.equal(bag.body.summary.subtotal, 3670);

    token = await csrf(customer);
    const orderResponse = await customer.post('/api/orders').set('x-csrf-token', token)
      .send({
        customerName: 'Test Shopper',
        customerEmail: 'shopper@example.net',
        customerAddress: '1 Demo Street, Cebu City',
        idempotencyKey: 'checkout-test-key-1'
      }).expect(201);
    assert.equal(orderResponse.body.order.status, 'pending');
    assert.equal(orderResponse.body.order.paymentStatus, 'not_collected');
    assert.equal(orderResponse.body.order.subtotal, 3670);
    assert.equal(orderResponse.body.order.shipping, 0);
    assert.equal(orderResponse.body.order.total, 3670);
    assert.match(orderResponse.body.order.orderNumber, /^DIA-[A-F0-9]+$/);
    assert.match(orderResponse.body.notice, /No payment was collected/i);
    assert.equal(db.prepare('SELECT stock FROM products WHERE id=?').get('essential-hoodie').stock, 11);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM cart_items WHERE user_id=?').get(registered.body.user.id).count, 0);

    // The same idempotency key returns the same order, even after the bag is cleared.
    token = await csrf(customer);
    const duplicate = await customer.post('/api/orders').set('x-csrf-token', token)
      .send({
        customerName: 'Test Shopper',
        customerEmail: 'shopper@example.net',
        customerAddress: '1 Demo Street, Cebu City',
        idempotencyKey: 'checkout-test-key-1'
      }).expect(200);
    assert.equal(duplicate.body.duplicate, true);
    assert.equal(duplicate.body.order.id, orderResponse.body.order.id);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM orders').get().count, 1);

    const history = await customer.get('/api/orders').expect(200);
    assert.equal(history.body.orders.length, 1);
    assert.equal(history.body.orders[0].items.length, 2);
    await customer.get('/api/admin/stats').expect(403);
    await customer.get('/api/admin/products').expect(403);
    await customer.get('/api/admin/orders').expect(403);
    await customer.get('/api/admin/analytics').expect(403);

    // A separate admin session can view product costs and manage products/orders.
    const adminAgent = request.agent(app);
    await adminSignIn(adminAgent, db).then((response) => {
      assert.equal(response.status, 200);
      assert.equal(response.body.user.role, 'admin');
    });
    const adminProducts = await adminAgent.get('/api/admin/products').expect(200);
    const hoodie = adminProducts.body.products.find((product) => product.id === 'essential-hoodie');
    assert.equal(hoodie.costPrice, null);

    const adminToken = await csrf(adminAgent);
    const created = await adminAgent.post('/api/admin/products').set('x-csrf-token', adminToken)
      .send({
        name: 'Demo Jacket', category: 'Jackets', description: 'Seeded test inventory',
        price: 2400, costPrice: null, color: 'Olive', sizes: ['S','M','L'],
        image: '/assets/dia-editorial.webp', imagePosition: 'center center', tag: 'Sample',
        stock: 5
      }).expect(201);
    assert.equal(created.body.product.stock, 5);
    assert.equal(created.body.product.isSample, false);
    assert.equal(Object.hasOwn((await customer.get('/api/products').expect(200)).body.products.find(p => p.id === created.body.product.id), 'costPrice'), false);

    const updateToken = await csrf(adminAgent);
    await adminAgent.patch('/api/admin/products/' + created.body.product.id).set('x-csrf-token', updateToken)
      .send({ price: 2450, costPrice: 900, stock: 7 }).expect(200);
    const privateProduct = (await adminAgent.get('/api/admin/products').expect(200)).body.products.find(p => p.id === created.body.product.id);
    assert.equal(privateProduct.price, 2450);
    assert.equal(privateProduct.costPrice, 900);
    assert.equal(privateProduct.stock, 7);

    // Valid business-status transitions are enforced and statistics reflect database rows.
    let statusToken = await csrf(adminAgent);
    await adminAgent.patch('/api/admin/orders/' + orderResponse.body.order.id).set('x-csrf-token', statusToken).send({ status: 'confirmed' }).expect(200);
    statusToken = await csrf(adminAgent);
    await adminAgent.patch('/api/admin/orders/' + orderResponse.body.order.id).set('x-csrf-token', statusToken).send({ status: 'processing' }).expect(200);
    statusToken = await csrf(adminAgent);
    await adminAgent.patch('/api/admin/orders/' + orderResponse.body.order.id).set('x-csrf-token', statusToken).send({ status: 'shipped' }).expect(200);
    statusToken = await csrf(adminAgent);
    await adminAgent.patch('/api/admin/orders/' + orderResponse.body.order.id).set('x-csrf-token', statusToken).send({ status: 'completed' }).expect(200);
    statusToken = await csrf(adminAgent);
    const invalid = await adminAgent.patch('/api/admin/orders/' + orderResponse.body.order.id).set('x-csrf-token', statusToken).send({ status: 'pending' }).expect(409);
    assert.equal(invalid.body.error.code, 'INVALID_ORDER_TRANSITION');

    const stats = (await adminAgent.get('/api/admin/stats').expect(200)).body.stats;
    assert.equal(stats.totalUsers, 1);
    assert.equal(stats.totalProducts, 5);
    assert.equal(stats.totalOrders, 1);
    assert.equal(stats.completedOrders, 1);
    assert.equal(stats.completedOrderValue, 3670);
    assert.equal(stats.collectedRevenue, 0);
    assert.equal(stats.grossProfit, null);
    assert.equal(stats.profitAvailable, false);

    const analytics = await adminAgent.get('/api/admin/analytics?days=30').expect(200);
    assert.equal(analytics.body.periodDays, 30);
    assert.ok(analytics.body.topProducts.some((product) => product.name === 'Essential Hoodie'));
    assert.match(analytics.body.paymentNotice, /does not integrate a payment provider/i);
    const adminOrders = await adminAgent.get('/api/admin/orders').expect(200);
    assert.equal(adminOrders.body.orders[0].status, 'completed');

    // Revenue is not fabricated and cost details never leak to regular customers.
    assert.equal(Object.hasOwn((await customer.get('/api/products').expect(200)).body.products[0], 'costPrice'), false);
    const logoutToken = await csrf(customer);
    await customer.post('/api/auth/logout').set('x-csrf-token', logoutToken).send({}).expect(200);
    await customer.get('/api/orders').expect(401);
    await customer.get('/api/admin/stats').expect(401);
  } finally {
    db.close();
  }
});

test('order checkout rejects invalid quantities, sizes, empty carts and unauthorized access', async () => {
  const db = createDatabase(':memory:');
  try {
    seedSampleProducts({ db, logger: quiet });
    const { app } = createApp({ db, env: { NODE_ENV: 'test', APP_ORIGIN: 'http://localhost:3000' } });
    const publicClient = request.agent(app);
    await publicClient.get('/api/cart').expect(401);
    await publicClient.get('/api/orders').expect(401);
    const emptyUser = request.agent(app);
    await registerCustomer(emptyUser);
    let token = await csrf(emptyUser);
    const empty = await emptyUser.post('/api/orders').set('x-csrf-token', token)
      .send({ customerName:'Test User', customerEmail:'shopper@example.net', customerAddress:'1 Demo Street', idempotencyKey:'empty-bag-test' })
      .expect(409);
    assert.equal(empty.body.error.code, 'EMPTY_CART');

    token = await csrf(emptyUser);
    const invalidSize = await emptyUser.post('/api/cart/items').set('x-csrf-token', token)
      .send({ productId:'essential-hoodie', size:'Not A Size', quantity:1 }).expect(400);
    assert.equal(invalidSize.body.error.code, 'INVALID_PRODUCT_SIZE');

    token = await csrf(emptyUser);
    const invalidQuantity = await emptyUser.post('/api/cart/items').set('x-csrf-token', token)
      .send({ productId:'essential-hoodie', size:'M', quantity:100 }).expect(400);
    assert.equal(invalidQuantity.body.error.code, 'INVALID_QUANTITY');
  } finally {
    db.close();
  }
});
