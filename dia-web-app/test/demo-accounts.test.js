'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { createDatabase } = require('../src/db');
const { createApp } = require('../src/server');
const { seedDemoAccounts } = require('../scripts/seed-demo-accounts');
const { disableDemoAccounts } = require('../scripts/disable-demo-accounts');

const credentials = {
  user: { email: 'demo@example.com', password: 'DemoUser2026!' },
  admin: { email: 'admin@example.com', password: 'AdminDemo2026!' }
};
const enabledEnv = { ENABLE_DEMO_ACCOUNTS: 'true' };
const quiet = { log() {}, warn() {} };

function temporaryDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dia-demo-accounts-'));
  return { dir, file: path.join(dir, 'dia.sqlite') };
}
function removeTemp(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}
async function csrf(agent) {
  const response = await agent.get('/api/auth/csrf').expect(200);
  return response.body.csrfToken;
}
async function login(agent, endpoint, account) {
  const token = await csrf(agent);
  return agent.post(endpoint)
    .set('x-csrf-token', token)
    .send({ email: account.email, password: account.password })
    .expect(200);
}

test('demo seeding is disabled by default and does not create database accounts', async () => {
  const db = createDatabase(':memory:');
  try {
    const result = await seedDemoAccounts({ env: {}, db, logger: quiet });
    assert.equal(result.enabled, false);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM users').get().count, 0);
  } finally {
    db.close();
  }
});

test('opt-in seed creates correctly hashed roles and is repeatable without overwriting accounts', async () => {
  const db = createDatabase(':memory:');
  try {
    const first = await seedDemoAccounts({ env: enabledEnv, db, logger: quiet });
    assert.deepEqual(first.created.sort(), [credentials.admin.email, credentials.user.email].sort());
    assert.deepEqual(first.conflicts, []);

    const user = db.prepare('SELECT id,email,password_hash,role,status,is_demo FROM users WHERE email=?').get(credentials.user.email);
    const admin = db.prepare('SELECT id,email,password_hash,role,status,is_demo FROM users WHERE email=?').get(credentials.admin.email);
    assert.equal(user.role, 'user');
    assert.equal(user.status, 'active');
    assert.equal(user.is_demo, 1);
    assert.ok(user.password_hash.startsWith('$2'));
    assert.equal(await bcrypt.compare(credentials.user.password, user.password_hash), true);
    assert.equal(admin.role, 'admin');
    assert.equal(admin.status, 'active');
    assert.equal(admin.is_demo, 1);
    assert.ok(admin.password_hash.startsWith('$2'));
    assert.equal(await bcrypt.compare(credentials.admin.password, admin.password_hash), true);

    const before = db.prepare('SELECT id,email,password_hash,role,status,is_demo,updated_at FROM users ORDER BY email').all();
    const second = await seedDemoAccounts({ env: enabledEnv, db, logger: quiet });
    const after = db.prepare('SELECT id,email,password_hash,role,status,is_demo,updated_at FROM users ORDER BY email').all();
    assert.deepEqual(second.created, []);
    assert.deepEqual(second.skipped.sort(), [credentials.admin.email, credentials.user.email].sort());
    assert.deepEqual(after, before);

    // Existing users sharing a desired email are a conflict: never reset password or role.
    const protectedHash = bcrypt.hashSync('PreExisting-account-secret-55', 4);
    db.prepare("UPDATE users SET password_hash=?,role='admin',status='disabled',is_demo=0 WHERE email=?").run(protectedHash, credentials.user.email);
    const conflicted = await seedDemoAccounts({ env: enabledEnv, db, logger: quiet });
    const unchanged = db.prepare('SELECT password_hash,role,status,is_demo FROM users WHERE email=?').get(credentials.user.email);
    assert.deepEqual(conflicted.conflicts, [credentials.user.email]);
    assert.equal(unchanged.password_hash, protectedHash);
    assert.equal(unchanged.role, 'admin');
    assert.equal(unchanged.status, 'disabled');
    assert.equal(unchanged.is_demo, 0);
  } finally {
    db.close();
  }
});

test('seeded accounts complete login, role protection, dashboard access, logout, and file-database restart', async () => {
  const temp = temporaryDatabase();
  let db;
  try {
    db = createDatabase(temp.file);
    const seeded = await seedDemoAccounts({ env: enabledEnv, db, logger: quiet });
    assert.equal(seeded.created.length, 2);
    db.close();

    // Reopen the real SQLite file to verify that the seeded rows survive a normal process restart.
    db = createDatabase(temp.file);
    const { app } = createApp({ db, env: { NODE_ENV: 'test', APP_ORIGIN: 'http://localhost:3000' } });

    const userAgent = request.agent(app);
    const userLogin = await login(userAgent, '/api/auth/login', credentials.user);
    assert.equal(userLogin.body.authenticated, true);
    assert.equal(userLogin.body.user.email, credentials.user.email);
    assert.equal(userLogin.body.user.role, 'user');
    await userAgent.get('/').expect(200);
    const profile = await userAgent.get('/api/profile').expect(200);
    assert.equal(profile.body.user.email, credentials.user.email);
    await userAgent.get('/api/admin/stats').expect(403);
    await userAgent.get('/api/admin/users').expect(403);
    // A customer can open the public admin sign-in shell to switch accounts, but
    // this must never grant access to administrator APIs or private dashboard data.
    const adminShell = await userAgent.get('/admin').expect(200);
    assert.match(adminShell.text, /adminLogin/);
    assert.match(adminShell.text, /adminDashboard/);
    await userAgent.get('/admin.html').expect(200);
    await userAgent.get('/api/admin/stats').expect(403);

    await userAgent.post('/api/auth/logout')
      .set('x-csrf-token', userLogin.body.csrfToken)
      .send({})
      .expect(200);
    await userAgent.get('/api/profile').expect(401);
    await userAgent.get('/api/auth/me').expect(401);

    const adminAgent = request.agent(app);
    const adminLogin = await login(adminAgent, '/api/auth/admin-login', credentials.admin);
    assert.equal(adminLogin.body.authenticated, true);
    assert.equal(adminLogin.body.user.email, credentials.admin.email);
    assert.equal(adminLogin.body.user.role, 'admin');
    await adminAgent.get('/admin').expect(200);
    await adminAgent.get('/admin.html').expect(200);
    const stats = await adminAgent.get('/api/admin/stats').expect(200);
    assert.equal(stats.body.stats.totalUsers, 1);
    assert.equal(stats.body.stats.administrators, 1);
    const accounts = await adminAgent.get('/api/admin/users').expect(200);
    assert.equal(accounts.body.pagination.total, 2);
    assert.ok(accounts.body.users.every((row) => !Object.hasOwn(row, 'password_hash')));

    await adminAgent.post('/api/auth/logout')
      .set('x-csrf-token', adminLogin.body.csrfToken)
      .send({})
      .expect(200);
    await adminAgent.get('/api/admin/stats').expect(401);
    await adminAgent.get('/api/auth/me').expect(401);
  } finally {
    if (db) db.close();
    removeTemp(temp.dir);
  }
});

test('demo:disable disables only seeded accounts and revokes their sessions', async () => {
  const db = createDatabase(':memory:');
  try {
    await seedDemoAccounts({ env: enabledEnv, db, logger: quiet });
    const now = new Date().toISOString();
    db.prepare("INSERT INTO users(id,email,name,role,status,created_at,updated_at) VALUES('ordinary-1','ordinary@example.com','Ordinary','user','active',?,?)").run(now, now);
    const userId = db.prepare('SELECT id FROM users WHERE email=?').get(credentials.user.email).id;
    db.prepare("INSERT INTO sessions(token_hash,user_id,csrf_token,auth_method,created_at,last_seen_at,expires_at) VALUES('demo-session-hash',?,'csrf','password',1,1,9999999999999)").run(userId);

    const result = disableDemoAccounts({ db, logger: quiet });
    assert.deepEqual(result.disabled.sort(), [credentials.admin.email, credentials.user.email].sort());
    assert.equal(db.prepare('SELECT status FROM users WHERE email=?').get(credentials.user.email).status, 'disabled');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions WHERE user_id=?').get(userId).count, 0);
    assert.equal(db.prepare('SELECT status FROM users WHERE email=?').get('ordinary@example.com').status, 'active');
  } finally {
    db.close();
  }
});

test('unauthenticated visitors can still load the separate administrator sign-in form', async () => {
  const db = createDatabase(':memory:');
  try {
    const { app } = createApp({ db, env: { NODE_ENV: 'test', APP_ORIGIN: 'http://localhost:3000' } });
    await request(app).get('/admin').expect(200);
    await request(app).get('/admin.html').expect(200);
  } finally {
    db.close();
  }
});
