'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const { createDatabase } = require('../src/db');
const { createApp } = require('../src/server');

const root = path.join(__dirname, '..');
const serverSource = fs.readFileSync(path.join(root, 'src', 'server.js'), 'utf8');

const routeContract = [
  ['GET', '/api/health'],
  ['GET', '/api/config'],
  ['GET', '/api/auth/csrf'],
  ['GET', '/api/auth/me'],
  ['GET', '/api/products'],
  ['GET', '/api/profile'],
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
  const routePattern = /app\\.(get|post|patch|put|delete)\\(\\s*['"]([^'"]+)['"]/g;
  const registered = new Set(
    [...serverSource.matchAll(routePattern)].map((match) => `${match[1].toUpperCase()} ${match[2]}`)
  );
  for (const [method, route] of routeContract) {
    assert.ok(registered.has(`${method} ${route}`), `Missing backend route: ${method} ${route}`);
  }

  const frontendCalls = [
    ['auth.js', "fetch('/api/auth/csrf'"],
    ['auth.js', "api('/api/auth/login'"],
    ['auth.js', "api('/api/auth/register'"],
    ['auth.js', "api('/api/auth/google'"],
    ['auth.js', "api('/api/auth/logout'"],
    ['auth.js', "api('/api/config'"],
    ['auth.js', "fetch('/api/auth/me'"],
    ['admin.js', "api('/api/admin/stats'"],
    ['admin.js', "api('/api/admin/users?'"],
    ['admin.js', "api('/api/admin/users/'"],
    ['admin.js', "api('/api/auth/admin-login'"],
    ['admin.js', "api('/api/auth/logout'"],
    ['admin.js', "fetch('/api/auth/me'"]
  ];
  for (const [file, expression] of frontendCalls) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(source.includes(expression), `Expected API call not found in ${file}: ${expression}`);
  }
});

test('health, config, products, and protected endpoints return their expected behavior', async () => {
  const db = createDatabase(':memory:');
  try {
    const { app } = createApp({
      db,
      env: { NODE_ENV: 'test', APP_ORIGIN: 'http://localhost:3000' }
    });

    const health = await request(app).get('/api/health').expect(200);
    assert.deepEqual(health.body, { status: 'ok' });

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
