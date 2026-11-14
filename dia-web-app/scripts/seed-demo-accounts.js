'use strict';

require('dotenv').config();
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { createDatabase } = require('../src/db');

const DEFAULTS = Object.freeze({
  user: Object.freeze({ email: 'demo@example.test', name: 'Demo User', role: 'user' }),
  admin: Object.freeze({ email: 'admin.demo@example.test', name: 'Demo Administrator', role: 'admin' })
});
const validEmail = (value) => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validPassword = (value, minimum) => typeof value === 'string' &&
  value.length >= minimum && value.length <= 1024 && /[A-Za-z]/.test(value) && /[0-9]/.test(value);

function accountFromEnvironment(env, kind) {
  const base = DEFAULTS[kind];
  const email = String(env[kind === 'user' ? 'DEMO_USER_EMAIL' : 'DEMO_ADMIN_EMAIL'] || base.email).trim().toLowerCase();
  const password = env[kind === 'user' ? 'DEMO_USER_PASSWORD' : 'DEMO_ADMIN_PASSWORD'] || '';
  const minimum = kind === 'admin' ? 14 : 12;
  if (!validEmail(email)) throw new Error('Invalid demo ' + kind + ' email address.');
  if (!password) throw new Error('Set DEMO_' + kind.toUpperCase() + '_PASSWORD in your private .env or run npm.cmd run demo:setup.');
  if (!validPassword(password, minimum)) throw new Error('Demo ' + kind + ' password must be at least ' + minimum + ' characters and include a letter and a number.');
  return { ...base, email, password };
}

/**
 * Creates demo accounts only when explicitly enabled. Existing rows are never mutated:
 * the script will not reset passwords, elevate/demote roles, or re-enable disabled users.
 * Pass a database instance to reuse a test database; otherwise the configured SQLite file is used.
 */
async function seedDemoAccounts({ env = process.env, db: suppliedDb, logger = console } = {}) {
  if (env.ENABLE_DEMO_ACCOUNTS !== 'true') {
    logger.log('Demo account seeding is disabled. Set ENABLE_DEMO_ACCOUNTS=true and run this command only in an intentional demonstration environment.');
    return { enabled: false, created: [], skipped: [], conflicts: [] };
  }

  if (!['development', 'test'].includes(env.NODE_ENV)) {
    throw new Error('Demo account seeding is allowed only when NODE_ENV=development (or test for automated tests).');
  }

  const accounts = [accountFromEnvironment(env, 'user'), accountFromEnvironment(env, 'admin')];
  if (accounts[0].email === accounts[1].email) throw new Error('Demo user and administrator must use different email addresses.');

  const db = suppliedDb || createDatabase(env.DATABASE_PATH);
  const ownsDb = !suppliedDb;
  const created = [];
  const skipped = [];
  const conflicts = [];
  try {
    for (const account of accounts) {
      const existing = db.prepare('SELECT id, password_hash, role, status, is_demo FROM users WHERE email = ?').get(account.email);
      if (existing) {
        if (existing.is_demo === 1 && existing.role === account.role && existing.status === 'active' && existing.password_hash) {
          skipped.push(account.email);
          logger.log('Demo account already exists and was left unchanged: ' + account.email);
        } else {
          conflicts.push(account.email);
          logger.warn('Account already exists; no changes made: ' + account.email);
        }
        continue;
      }

      const passwordHash = await bcrypt.hash(account.password, 12);
      const now = new Date().toISOString();
      db.prepare("INSERT INTO users(id,email,password_hash,name,role,status,is_demo,created_at,updated_at) VALUES(?,?,?,?,?,'active',1,?,?)")
        .run(crypto.randomUUID(), account.email, passwordHash, account.name, account.role, now, now);
      created.push(account.email);
      logger.log('Created demo ' + account.role + ' account: ' + account.email);
    }
  } finally {
    if (ownsDb) db.close();
  }

  return { enabled: true, created, skipped, conflicts };
}

async function main() {
  const result = await seedDemoAccounts();
  if (result.conflicts.length) {
    console.error('Resolve the existing-account conflicts manually; no existing credentials or roles were changed.');
    process.exitCode = 2;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { seedDemoAccounts };
