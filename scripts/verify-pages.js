'use strict';

const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { createDatabase } = require('../src/db');
const { createApp } = require('../src/server');
const { seedSampleProducts } = require('../scripts/seed-sample-products');

async function verifyAllPages() {
  const db = createDatabase(':memory:');
  try {
    seedSampleProducts({ db, logger: { log() {} } });
    const { app } = createApp({
      db,
      env: {
        NODE_ENV: 'test',
        APP_ORIGIN: 'http://localhost:3000'
      }
    });

    console.log('1. Testing public pages...');
    const publicPages = [
      ['/', 'Dia — Wear your story'],
      ['/index.html', 'Wear your'],
      ['/login', 'Sign in'],
      ['/register', 'Make it'],
      ['/admin/login', 'Administrator sign in'],
      ['/forgot.html', 'ACCOUNT SUPPORT']
    ];

    for (const [route, textToken] of publicPages) {
      const res = await request(app).get(route).expect(200);
      assert.ok(res.text.includes(textToken), `Expected "${textToken}" on ${route}`);
      console.log(`   ✓ ${route} (HTTP 200, length: ${res.text.length})`);
    }

    console.log('2. Testing customer dashboard page (/dashboard)...');
    // Unauthenticated request redirects to /login
    await request(app).get('/dashboard').expect(302).expect('Location', '/login');
    console.log('   ✓ Unauthenticated /dashboard redirects to /login (302)');

    // Register & sign in customer
    const customer = request.agent(app);
    const csrfToken = (await customer.get('/api/auth/csrf').expect(200)).body.csrfToken;
    await customer.post('/api/auth/register')
      .set('x-csrf-token', csrfToken)
      .send({
        name: 'Elena Rostova',
        username: 'elenar',
        email: 'elena@example.net',
        password: 'Customer-Pass-2026!',
        confirmPassword: 'Customer-Pass-2026!'
      })
      .expect(201);

    const dashRes = await customer.get('/dashboard').expect(200);
    assert.ok(dashRes.text.includes('YOUR DIA ACCOUNT'));
    console.log(`   ✓ Authenticated /dashboard serves dashboard.html (HTTP 200, length: ${dashRes.text.length})`);

    console.log('3. Testing administrator dashboard (/admin)...');
    // Unauthenticated request redirects
    await request(app).get('/admin').expect(302);
    console.log('   ✓ Unauthenticated /admin redirects (302)');

    const now = new Date().toISOString();
    db.prepare("INSERT INTO users(id,email,password_hash,name,role,status,created_at,updated_at) VALUES('verif-admin','verif-admin@example.net',?,'Verification Admin','admin','active',?,?)")
      .run(bcrypt.hashSync('Admin-pass-12345!', 4), now, now);

    const adminAgent = request.agent(app);
    const adminCsrf = (await adminAgent.get('/api/auth/csrf').expect(200)).body.csrfToken;
    await adminAgent.post('/api/auth/admin-login')
      .set('x-csrf-token', adminCsrf)
      .send({ email: 'verif-admin@example.net', password: 'Admin-pass-12345!' })
      .expect(200);

    const adminRes = await adminAgent.get('/admin').expect(200);
    assert.ok(adminRes.text.includes('Overview'));
    assert.ok(adminRes.text.includes('id="revenueToday"'));
    console.log(`   ✓ Authenticated /admin serves admin.html (HTTP 200, length: ${adminRes.text.length})`);

    console.log('4. Testing products catalog API and sample seeding...');
    const prodRes = await request(app).get('/api/products').expect(200);
    assert.ok(prodRes.body.products.length >= 22, `Expected >= 22 products, got ${prodRes.body.products.length}`);
    console.log(`   ✓ /api/products returns ${prodRes.body.products.length} live products`);

    console.log('\nAll pages and roles verified successfully!');
  } finally {
    db.close();
  }
}

if (require.main === module) {
  verifyAllPages().catch((err) => {
    console.error('Verification failed:', err);
    process.exit(1);
  });
}

module.exports = { verifyAllPages };
