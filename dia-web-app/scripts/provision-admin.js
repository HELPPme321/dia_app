'use strict';

require('dotenv').config();
const crypto = require('node:crypto');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const { createDatabase } = require('../src/db');

const validEmail = (value) => typeof value === 'string' && value.length <= 254 &&
  /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value);
const validPassword = (value) => typeof value === 'string' &&
  value.length >= 14 && value.length <= 1024 && /[A-Za-z]/.test(value) && /[0-9]/.test(value);

/**
 * Provisioning is an explicit local/operator action, never an HTTP API.
 * Existing records are intentionally promoted and their password reset only
 * when an operator supplies the exact email and new password to this command.
 */
async function provisionAdmin({ env = process.env, db: suppliedDb, logger = console } = {}) {
  const email = typeof env.ADMIN_EMAIL === 'string' ? env.ADMIN_EMAIL.trim().toLowerCase() : '';
  const password = env.ADMIN_PASSWORD;
  if (!validEmail(email)) {
    throw new Error('Set ADMIN_EMAIL to the administrator email address in your private .env, or run npm.cmd run admin:setup for a secure prompt.');
  }
  if (!validPassword(password)) {
    throw new Error('ADMIN_PASSWORD must be at least 14 characters and include a letter and a number. Use a unique password; never commit .env.');
  }

  const databasePath = env.DATABASE_PATH || process.env.DATABASE_PATH || undefined;
  const db = suppliedDb || createDatabase(databasePath);
  const ownsDb = !suppliedDb;
  try {
    const existing = db.prepare('SELECT id,role,status FROM users WHERE email = ?').get(email);
    const now = new Date().toISOString();
    const passwordHash = await bcrypt.hash(password, 12);
    const userId = existing?.id || crypto.randomUUID();
    db.transaction(() => {
      if (existing) {
        db.prepare("UPDATE users SET password_hash=?,role='admin',status='active',is_demo=0,updated_at=? WHERE id=?")
          .run(passwordHash, now, userId);
      } else {
        db.prepare("INSERT INTO users(id,email,password_hash,name,role,status,is_demo,created_at,updated_at) VALUES(?,?,?,'Administrator','admin','active',0,?,?)")
          .run(userId, email, passwordHash, now, now);
      }
      // Any old customer/admin sessions are revoked whenever credentials or role
      // are reset, ensuring the next request uses the new admin authentication method.
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
    })();
    logger.log((existing ? 'Administrator account repaired and password reset for ' : 'Administrator account created for ') + email + '.');
    logger.log('Database: ' + (databasePath === ':memory:' ? ':memory:' : path.resolve(databasePath || require('../src/db').DEFAULT_DATABASE_PATH)));
    logger.log('Now sign in at /admin with this email and password. Unset ADMIN_PASSWORD after provisioning.');
    return { id: userId, email, created: !existing, databasePath: databasePath || require('../src/db').DEFAULT_DATABASE_PATH };
  } finally {
    if (ownsDb) db.close();
  }
}

async function readTerminal(prompt, { secret = false } = {}) {
  const input = process.stdin;
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    throw new Error('Interactive setup needs a terminal. Set ADMIN_EMAIL and ADMIN_PASSWORD in the private .env, then run npm.cmd run admin:provision.');
  }
  return new Promise((resolve, reject) => {
    let value = '';
    let settled = false;
    process.stdout.write(prompt);
    const finish = (error) => {
      if (settled) return;
      settled = true;
      input.removeListener('data', onData);
      input.setRawMode(false);
      input.pause();
      process.stdout.write('\n');
      if (error) reject(error); else resolve(value);
    };
    const onData = (chunk) => {
      for (const character of String(chunk)) {
        if (character === '\u0003') return finish(new Error('Administrator setup cancelled.'));
        if (character === '\r' || character === '\n') return finish();
        if (character === '\u007f' || character === '\b') {
          if (value.length) {
            value = value.slice(0, -1);
            process.stdout.write('\b \b');
          }
          continue;
        }
        if (character.charCodeAt(0) < 32) continue;
        value += character;
        process.stdout.write(secret ? '*' : character);
      }
    };
    input.setEncoding('utf8');
    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}
async function setupInteractively() {
  const email = (process.env.ADMIN_EMAIL || await readTerminal('Administrator email: ')).trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || await readTerminal('New admin password (hidden, 14+ characters): ', { secret: true });
  if (!process.env.ADMIN_PASSWORD) {
    const confirmation = await readTerminal('Confirm new admin password (hidden): ', { secret: true });
    if (password !== confirmation) throw new Error('The passwords do not match. No administrator changes were made.');
  }
  return provisionAdmin({ env: { ...process.env, ADMIN_EMAIL: email, ADMIN_PASSWORD: password } });
}

if (require.main === module) {
  const interactive = process.argv.includes('--interactive') || (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD);
  (interactive ? setupInteractively() : provisionAdmin()).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { provisionAdmin, validEmail, validPassword };
