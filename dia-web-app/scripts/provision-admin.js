'use strict';

require('dotenv').config();
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { createDatabase } = require('../src/db');

async function main() {
  const email = typeof process.env.ADMIN_EMAIL === 'string' ? process.env.ADMIN_EMAIL.trim().toLowerCase() : '';
  const password = process.env.ADMIN_PASSWORD;
  if (!email || email.endsWith('@example.com') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Set ADMIN_EMAIL in your private .env before provisioning an administrator.');
  }
  if (typeof password !== 'string' || password.length < 14 || password.length > 1024) {
    throw new Error('ADMIN_PASSWORD must be at least 14 characters. Use a unique password and never commit .env.');
  }

  const db = createDatabase(process.env.DATABASE_PATH);
  try {
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    const hash = await bcrypt.hash(password, 12);
    const now = new Date().toISOString();
    if (existing) {
      db.prepare("UPDATE users SET password_hash = ?, role = 'admin', status = 'active', updated_at = ? WHERE id = ?")
        .run(hash, now, existing.id);
      console.log('Administrator credentials updated for ' + email + '.');
    } else {
      db.prepare("INSERT INTO users(id, email, password_hash, name, role, status, created_at, updated_at) VALUES (?, ?, ?, 'Administrator', 'admin', 'active', ?, ?)")
        .run(crypto.randomUUID(), email, hash, now, now);
      console.log('Administrator account created for ' + email + '.');
    }
    console.log('Unset ADMIN_PASSWORD after provisioning. Never commit .env.');
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
