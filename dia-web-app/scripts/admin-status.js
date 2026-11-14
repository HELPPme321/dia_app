'use strict';

require('dotenv').config();
const path = require('node:path');
const { createDatabase, DEFAULT_DATABASE_PATH } = require('../src/db');

function main() {
  const databasePath = process.env.DATABASE_PATH || DEFAULT_DATABASE_PATH;
  const email = typeof process.env.ADMIN_EMAIL === 'string' ? process.env.ADMIN_EMAIL.trim().toLowerCase() : '';
  const db = createDatabase(databasePath);
  try {
    const administrators = db.prepare(
      "SELECT email,role,status,CASE WHEN password_hash IS NULL OR password_hash='' THEN 0 ELSE 1 END AS passwordReady,created_at,last_login_at FROM users WHERE role='admin' ORDER BY created_at"
    ).all();
    console.log('Database: ' + (databasePath === ':memory:' ? ':memory:' : path.resolve(databasePath)));
    if (email) {
      const account = db.prepare(
        "SELECT email,role,status,CASE WHEN password_hash IS NULL OR password_hash='' THEN 0 ELSE 1 END AS passwordReady FROM users WHERE email=?"
      ).get(email);
      if (!account) console.log('Configured ADMIN_EMAIL: no matching account');
      else console.log('Configured ADMIN_EMAIL: ' + JSON.stringify(account));
    }
    if (!administrators.length) {
      console.log('Administrator accounts: none. Run npm.cmd run admin:setup to create one.');
    } else {
      console.log('Administrator accounts (password hashes are never printed):');
      administrators.forEach((account) => console.log(JSON.stringify(account)));
    }
  } finally {
    db.close();
  }
}

if (require.main === module) {
  try { main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { main };
