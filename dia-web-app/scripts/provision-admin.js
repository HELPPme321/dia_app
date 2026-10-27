'use strict';

require('dotenv').config();
const crypto = require('node:crypto');
const readline = require('node:readline/promises');
const bcrypt = require('bcryptjs');
const { createDatabase } = require('../src/db');

const validEmail = (value) => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validPassword = (value) => typeof value === 'string' && value.length >= 14 && value.length <= 1024 && /[A-Za-z]/.test(value) && /[0-9]/.test(value);

async function askLine(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

function askHidden(question) {
  const input = process.stdin;
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    return Promise.reject(new Error('A hidden-password terminal prompt is unavailable. Set ADMIN_EMAIL and ADMIN_PASSWORD in your private .env file and run this command again.'));
  }
  return new Promise((resolve, reject) => {
    let value = '';
    const wasRaw = input.isRaw;
    const cleanup = () => {
      input.removeListener('data', onData);
      try { input.setRawMode(Boolean(wasRaw)); } catch {}
      input.pause();
    };
    const onData = (chunk) => {
      const text = chunk.toString('utf8');
      for (const character of text) {
        if (character === '\u0003') {
          cleanup();
          process.stdout.write('\n');
          reject(new Error('Administrator setup cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          cleanup();
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (character === '\u007f' || character === '\b') {
          if (value.length) {
            value = value.slice(0, -1);
            process.stdout.write('\b \b');
          }
          continue;
        }
        // Ignore terminal escape sequences and control characters; passwords are never echoed.
        if (character >= ' ' && character !== '\u001b' && character !== '\u007f') {
          value += character;
          process.stdout.write('*');
        }
      }
    };
    process.stdout.write(question);
    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}

async function getCredentials(env) {
  let email = typeof env.ADMIN_EMAIL === 'string' ? env.ADMIN_EMAIL.trim().toLowerCase() : '';
  let password = typeof env.ADMIN_PASSWORD === 'string' ? env.ADMIN_PASSWORD : '';
  let enteredPasswordInteractively = false;

  if (!email && process.stdin.isTTY && process.stdout.isTTY) {
    email = String(await askLine('Administrator email: ')).trim().toLowerCase();
  }
  if (!password && process.stdin.isTTY && process.stdout.isTTY) {
    password = await askHidden('Create administrator password (14+ characters, input hidden): ');
    enteredPasswordInteractively = true;
    const confirmation = await askHidden('Confirm administrator password (input hidden): ');
    if (password !== confirmation) throw new Error('The passwords do not match. No account changes were made.');
  }

  if (!validEmail(email) || email.endsWith('@example.com')) {
    throw new Error('Use a real, non-placeholder email for ADMIN_EMAIL. Run npm.cmd run admin:provision in an interactive terminal to enter one securely.');
  }
  if (!validPassword(password)) {
    throw new Error('ADMIN_PASSWORD must be 14+ characters and include a letter and a number. Run npm.cmd run admin:provision interactively to enter it without echoing it.');
  }
  return { email, password, enteredPasswordInteractively };
}

/**
 * Provisions an administrator in the configured SQLite database.
 * This is an explicit local/host-shell operation; no public API can create admins.
 * When an email already exists, the operator-provided credentials intentionally
 * promote/reactivate that exact account and replace its password.
 */
async function provisionAdmin({ env = process.env, db: suppliedDb, logger = console } = {}) {
  const { email, password } = await getCredentials(env);
  const db = suppliedDb || createDatabase(env.DATABASE_PATH);
  const ownsDb = !suppliedDb;
  try {
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    const hash = await bcrypt.hash(password, 12);
    const now = new Date().toISOString();
    let action;
    if (existing) {
      db.prepare("UPDATE users SET password_hash = ?, role = 'admin', status = 'active', updated_at = ? WHERE id = ?")
        .run(hash, now, existing.id);
      action = 'updated';
      logger.log('Administrator credentials provisioned for ' + email + '.');
    } else {
      db.prepare("INSERT INTO users(id, email, password_hash, name, role, status, created_at, updated_at) VALUES (?, ?, ?, 'Administrator', 'admin', 'active', ?, ?)")
        .run(crypto.randomUUID(), email, hash, now, now);
      action = 'created';
      logger.log('Administrator account created for ' + email + '.');
    }
    logger.log('Use this email and the password you just entered at /admin. Remove ADMIN_PASSWORD from your environment after provisioning.');
    return { email, action };
  } finally {
    if (ownsDb) db.close();
  }
}

if (require.main === module) {
  provisionAdmin().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { provisionAdmin, getCredentials };
