'use strict';

require('dotenv').config();
const { createDatabase } = require('../src/db');

/**
 * Disables only accounts created by the opt-in seed process and revokes their sessions.
 * Ordinary accounts and pre-existing accounts using the same email are not touched.
 */
function disableDemoAccounts({ db: suppliedDb, logger = console } = {}) {
  const db = suppliedDb || createDatabase(process.env.DATABASE_PATH);
  const ownsDb = !suppliedDb;
  try {
    const targets = db.prepare("SELECT id, email FROM users WHERE is_demo = 1 AND status = 'active'").all();
    const update = db.prepare("UPDATE users SET status = 'disabled', updated_at = ? WHERE id = ? AND is_demo = 1");
    const revoke = db.prepare('DELETE FROM sessions WHERE user_id = ?');
    const now = new Date().toISOString();
    db.transaction(() => {
      for (const target of targets) {
        update.run(now, target.id);
        revoke.run(target.id);
      }
    })();
    logger.log('Disabled ' + targets.length + ' demo account(s) and revoked their sessions.');
    return { disabled: targets.map((row) => row.email) };
  } finally {
    if (ownsDb) db.close();
  }
}

if (require.main === module) {
  try {
    disableDemoAccounts();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { disableDemoAccounts };
