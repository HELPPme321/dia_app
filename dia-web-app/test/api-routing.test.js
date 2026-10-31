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
    ['auth.js', "fetch('/api/auth/csrf'"],
    ['js/auth.js', "fetch('/api/auth/csrf'"],
    ['login.js', "DiaAuth.request('/api/auth/login'"],
    ['js/register.js', "DiaAuth.request('/api/auth/register'"],
    ['login.js', "DiaAuth.request('/api/auth/google'"],
    ['login.js', "DiaAuth.request('/api/config'"],
    ['login.js', "DiaAuth.request('/api/auth/me'"],
    ['dashboard.js', "api('/api/auth/logout'"],
    ['dashboard.js', "api('/api/orders'"],
    ['js/storefront.js', "fetch('/api/products'"],
    ['js/storefront.js', "api('/api/cart'"],
    ['js/storefront.js', "api('/api/cart/items'"],
    ['js/storefront.js', "api('/api/orders'"],
    ['js/storefront.js', "api('/api/auth/me'"],
    ['js/storefront.js', "api('/api/auth/logout'"],
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
    ['admin-login.js', "DiaAuth.request('/api/auth/admin-login'"],
    ['admin.js', "api('/api/auth/logout'"],
    ['admin.js', "fetch('/api/auth/me'"]
  ];
  for (const file of ['index.html', 'login.html', 'register.html', 'admin-login.html', 'dashboard.html', 'forgot.html', 'forgot-password.html']) {
    assert.ok(fs.existsSync(path.join(root, file)), 'Expected dedicated page file: ' + file);
  }
  const homePage = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(homePage.includes('id="intro"'), 'The homepage must own the one-time brand intro');
  assert.ok(homePage.includes('class="site-nav"'), 'Homepage must use normal website navigation');
  assert.ok(homePage.includes('class="editorial-hero"'), 'Homepage must use the editorial fashion hero');
  assert.ok(homePage.includes('id="featuredProducts"'), 'Homepage must render the live product catalog');
  assert.ok(homePage.includes('id="bagDrawer"'), 'Homepage must include the account-backed bag');
  for (const category of ['dress', 'sneaker', 'bag', 'shades']) {
    assert.ok(homePage.includes('data-fashion-tile="' + category + '"'), 'Homepage must include the ' + category + ' category tile');
  }
  assert.ok(homePage.includes('id="introSound"') && homePage.includes('id="skipIntro"'), 'Cinematic intro must expose sound and skip controls');
  assert.ok(!homePage.includes('phone-frame'), 'Homepage must not be a phone mock-up');
  for (const file of ['login.html', 'admin-login.html']) {
    const page = fs.readFileSync(path.join(root, file), 'utf8');
    const authVersion = file === 'login.html' ? 'dia-cinematic-login-20261031' : 'dia-desktop-20261030';
    const fashionVersion = file === 'login.html' ? 'dia-cinematic-login-20261031' : 'dia-desktop-20261030';
    assert.ok(page.includes('<script src="/js/auth.js?v=' + authVersion + '" defer></script>'), file + ' must load shared auth helpers');
    assert.ok(page.includes('<script src="/js/fashion.js?v=' + fashionVersion + '" defer></script>'), file + ' must load the fashion showcase');
    assert.ok(page.includes('data-fashion-stage'), file + ' must include the animated fashion showcase');
    assert.ok(!page.includes('id="intro"'), file + ' must not replay the homepage intro');
  }
  const sharedAuth = fs.readFileSync(path.join(root, 'js', 'auth.js'), 'utf8');
  assert.ok(sharedAuth.includes('function getCsrf()'), 'Shared auth must handle CSRF tokens');
  assert.ok(sharedAuth.includes('function redirectByRole('), 'Shared auth must provide role-aware redirects');
  const fashionSource = fs.readFileSync(path.join(root, 'js', 'fashion.js'), 'utf8');
  assert.ok(fashionSource.includes('sessionStorage'), 'Homepage intro must be tracked once per session');
  assert.ok(fashionSource.includes('function playHomeIntro()'), 'Homepage fashion script must initialize the intro');
  const newCss = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
  assert.ok(newCss.includes('#0B3D2E'), 'Dia website should use the requested emerald brand color');
  assert.ok(newCss.includes('#D4AF37'), 'Dia website should use the requested champagne gold');
  assert.ok(newCss.includes('introMaster'), 'Homepage intro must use a coordinated master timeline');
  assert.ok(newCss.includes('prefers-reduced-motion'), 'All page motion must respect user preferences');
  const loginSource = fs.readFileSync(path.join(root, 'login.js'), 'utf8');
  assert.ok(loginSource.includes("DiaAuth.request('/api/auth/admin-login'"), 'Role-aware login must support administrator sign-in');
  assert.ok(loginSource.includes("error.code !== 'INVALID_CREDENTIALS'"), 'Admin fallback must only run after normal invalid credentials');
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

test('frontend asset URLs deliver Dia design rules and shared scripts', async () => {
  const db = createDatabase(':memory:');
  try {
    const { app } = createApp({ db, env: { NODE_ENV: 'test', APP_ORIGIN: 'http://localhost:3000' } });
    const home = await request(app).get('/').expect(200);
    assert.ok(home.text.includes('href="/css/style.css?v=dia-zip-integration-20261031"'));
    assert.ok(home.text.includes('src="/js/fashion.js?v=dia-cinematic-login-20261031"'));
    assert.ok(home.text.includes('src="/js/storefront.js?v=dia-live-storefront-20261031"'));

    const login = await request(app).get('/login').expect(200);
    assert.ok(login.text.includes('href="/css/style.css?v=dia-zip-integration-20261031"'));
    assert.ok(login.text.includes('src="/js/auth.js?v=dia-cinematic-login-20261031"'));
    assert.ok(login.text.includes('src="/js/fashion.js?v=dia-cinematic-login-20261031"'));

    const registration = await request(app).get('/register').expect(200);
    assert.ok(registration.text.includes('id="registerForm"'));
    assert.ok(registration.text.includes('src="/js/register.js?v=dia-register-page-20261031"'));
    await request(app).get('/register.html').expect(200);

    const registerScript = await request(app).get('/js/register.js?v=dia-register-page-20261031').expect(200);
    assert.ok(registerScript.headers['content-type'].includes('javascript'));
    assert.ok(registerScript.text.includes("DiaAuth.request('/api/auth/register'"));

    const css = await request(app).get('/css/style.css?v=dia-zip-integration-20261031').expect(200);
    assert.ok(css.headers['content-type'].includes('text/css'));
    for (const selector of ['.site-nav', '.editorial-hero', '.collection-grid', '.collection-card', '.product-grid', '.product-visual', '.fashion-stage', '.login-layout', '.login-card', '.gold-button']) {
      assert.ok(css.text.includes(selector), 'Dia stylesheet must include ' + selector);
    }

    const auth = await request(app).get('/js/auth.js?v=dia-cinematic-login-20261031').expect(200);
    assert.ok(auth.headers['content-type'].includes('javascript'));
    assert.ok(auth.text.includes('function getCsrf()'));
    const fashion = await request(app).get('/js/fashion.js?v=dia-cinematic-login-20261031').expect(200);
    assert.ok(fashion.headers['content-type'].includes('javascript'));
    assert.ok(fashion.text.includes('function playHomeIntro()'));
    const storefront = await request(app).get('/js/storefront.js?v=dia-live-storefront-20261031').expect(200);
    assert.ok(storefront.headers['content-type'].includes('javascript'));
    assert.ok(storefront.text.includes("api('/api/cart')"));
    await request(app).get('/forgot.html').expect(200);
    await request(app).get('/forgot-password').expect(200);
  } finally {
    db.close();
  }
});
