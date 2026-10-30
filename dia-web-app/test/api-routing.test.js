'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const { createDatabase } = require('../src/db');
const { createApp } = require('../src/server');
const { seedSampleProducts } = require('../scripts/seed-sample-products');

const root = path.join(__dirname, '..');
const serverSource = fs.readFileSync(path.join(root, 'src', 'server.js'), 'utf8');
const storeRouteSource = fs.readFileSync(path.join(root, 'src', 'store-routes.js'), 'utf8');
const routeSources = serverSource + '\n' + storeRouteSource;

const routeContract = [
  ['GET', '/api/health'],
  ['GET', '/api/config'],
  ['GET', '/api/auth/csrf'],
  ['GET', '/api/auth/me'],
  ['GET', '/api/categories'],
  ['GET', '/api/products'],
  ['GET', '/api/products/:id'],
  ['GET', '/api/profile'],
  ['GET', '/api/cart'],
  ['POST', '/api/cart/items'],
  ['PUT', '/api/cart/items'],
  ['DELETE', '/api/cart/items'],
  ['POST', '/api/orders'],
  ['GET', '/api/orders'],
  ['GET', '/api/orders/:id'],
  ['GET', '/api/admin/products'],
  ['POST', '/api/admin/products'],
  ['PATCH', '/api/admin/products/:id'],
  ['DELETE', '/api/admin/products/:id'],
  ['GET', '/api/admin/orders'],
  ['PATCH', '/api/admin/orders/:id'],
  ['GET', '/api/admin/analytics'],
  ['POST', '/api/auth/register'],
  ['POST', '/api/auth/login'],
  ['POST', '/api/auth/google'],
  ['POST', '/api/auth/admin-login'],
  ['POST', '/api/auth/logout'],
  ['GET', '/api/admin/stats'],
  ['GET', '/api/admin/users'],
  ['PATCH', '/api/admin/users/:id']
];

test('frontend API calls use methods and paths registered by Express', () => {
  const routePattern = /app\.(get|post|patch|put|delete)\(\s*['"]([^'"]+)['"]/g;
  const registered = new Set(
    [...routeSources.matchAll(routePattern)].map((match) => `${match[1].toUpperCase()} ${match[2]}`)
  );
  for (const [method, route] of routeContract) {
    assert.ok(registered.has(`${method} ${route}`), `Missing backend route: ${method} ${route}`);
  }

  const frontendCalls = [
    ['login.js', "fetch('/api/auth/csrf'"],
    ['login.js', "api('/api/auth/login'"],
    ['login.js', "api('/api/auth/register'"],
    ['login.js', "api('/api/auth/google'"],
    ['login.js', "fetch('/api/config'"],
    ['login.js', "fetch('/api/auth/me'"],
    ['dashboard.js', "api('/api/auth/logout'"],
    ['dashboard.js', "api('/api/orders'"],
    ['script.js', "fetch('/api/products?'"],
    ['script.js', "storeApi('/api/cart'"],
    ['script.js', "storeApi('/api/cart/items'"],
    ['script.js', "storeApi('/api/orders'"],
    ['admin.js', "api('/api/admin/stats'"],
    ['admin.js', "api('/api/admin/users?'"],
    ['admin.js', "api('/api/admin/users/'"],
    ['admin.js', "api('/api/admin/products?'"],
    ['admin.js', "api(id ? '/api/admin/products/'"],
    ['admin.js', "api('/api/admin/orders?'"],
    ['admin.js', "api('/api/admin/orders/'"],
    ['admin.js', "api('/api/admin/analytics?days='"],
    ['admin-login.js', "api('/api/auth/admin-login'"],
    ['admin.js', "api('/api/auth/logout'"],
    ['admin.js', "fetch('/api/auth/me'"]
  ];
  for (const page of ['/login', '/admin/login', '/dashboard', '/forgot-password']) {
    assert.ok(fs.existsSync(path.join(root, page.replace(/^\\//, '') + '.html')) || page === '/dashboard', 'Expected a page file for ' + page);
  }
  for (const [file, expression] of frontendCalls) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(source.includes(expression), `Expected API call not found in ${file}: ${expression}`);
  }
  for (const file of ['auth.js', 'script.js', 'admin.js']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(source.includes('function apiFailureMessage('), `${file} must identify failed API requests`);
    assert.ok(source.includes('returned HTTP 404'), `${file} must explain a non-API 404 response`);
    assert.ok(source.includes('requestPath'), `${file} must display the request path`);
  }
});

test('health, config, products, and protected endpoints return their expected behavior', async () => {
  const db = createDatabase(':memory:');
  try {
    seedSampleProducts({ db, logger: { log() {} } });
    const { app } = createApp({
      db,
      env: { NODE_ENV: 'test', APP_ORIGIN: 'http://localhost:3000', RENDER_GIT_COMMIT: 'test-commit-abcdef123456' }
    });

    const health = await request(app).get('/api/health').expect(200);
    assert.equal(health.body.status, 'ok');
    assert.equal(health.body.service, 'dia-plus-api');
    assert.equal(health.body.version, require('../package.json').version);
    assert.equal(health.body.buildCommit, 'test-commit-abcdef123456');

    const config = await request(app).get('/api/config').expect(200);
    assert.deepEqual(config.body, { googleClientId: '' });

    const products = await request(app).get('/api/products').expect(200);
    assert.ok(Array.isArray(products.body.products));
    assert.ok(products.body.products.length > 0);

    const csrf = await request(app).get('/api/auth/csrf').expect(200);
    assert.equal(typeof csrf.body.csrfToken, 'string');
    assert.ok(csrf.body.csrfToken.length > 20);

    const profile = await request(app).get('/api/profile').expect(401);
    assert.equal(profile.body.error.code, 'AUTHENTICATION_REQUIRED');

    const adminStats = await request(app).get('/api/admin/stats').expect(401);
    assert.equal(adminStats.body.error.code, 'AUTHENTICATION_REQUIRED');
  } finally {
    db.close();
  }
});

test('API 404 reports the exact method and path without exposing query parameters', async () => {
  const db = createDatabase(':memory:');
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  try {
    const { app } = createApp({
      db,
      env: { NODE_ENV: 'test', APP_ORIGIN: 'http://localhost:3000' }
    });

    const missing = await request(app)
      .get('/api/not-a-real-endpoint?token=must-not-be-logged')
      .expect(404);

    assert.equal(missing.body.error.code, 'ENDPOINT_NOT_FOUND');
    assert.equal(missing.body.error.service, 'dia-plus-api');
    assert.equal(missing.body.error.version, require('../package.json').version);
    assert.equal(missing.body.error.buildCommit, null);
    assert.equal(missing.body.error.method, 'GET');
    assert.equal(missing.body.error.path, '/api/not-a-real-endpoint');
    assert.equal(missing.body.error.message, 'No API endpoint is registered for GET /api/not-a-real-endpoint.');
    assert.doesNotMatch(JSON.stringify(missing.body), /must-not-be-logged/);
    assert.ok(warnings.some((entry) => entry.join(' ').includes('GET /api/not-a-real-endpoint')));
    assert.ok(warnings.every((entry) => !entry.join(' ').includes('must-not-be-logged')));

    const wrongMethod = await request(app).post('/api/products').send({}).expect(404);
    assert.equal(wrongMethod.body.error.code, 'ENDPOINT_NOT_FOUND');
    assert.equal(wrongMethod.body.error.method, 'POST');
    assert.equal(wrongMethod.body.error.path, '/api/products');
  } finally {
    console.warn = originalWarn;
    db.close();
  }
});
