'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dotenv = require('dotenv');
const { seedDemoAccounts } = require('./seed-demo-accounts');
const { seedSampleProducts } = require('./seed-sample-products');

const DEFAULTS = Object.freeze({
  DEMO_USER_EMAIL: 'demo@example.test',
  DEMO_ADMIN_EMAIL: 'admin.demo@example.test'
});

function newPassword() {
  let password = '';
  do { password = crypto.randomBytes(32).toString('base64url'); }
  while (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password));
  return password;
}

function setEnvValue(source, key, value) {
  const line = key + '=' + value;
  const matcher = new RegExp('^\\s*' + key + '\\s*=.*$', 'm');
  if (matcher.test(source)) return source.replace(matcher, line);
  const trimmed = source.replace(/\s*$/, '');
  return trimmed + (trimmed ? '\n' : '') + line + '\n';
}

/**
 * Creates local-only demo credentials, keeps .env private, imports the sample
 * catalog and seeds the two demo accounts. Production environments are rejected.
 */
async function setupDemoEnvironment({
  envPath = path.join(__dirname, '..', '.env'),
  db,
  logger = console,
  runtimeEnv = process.env
} = {}) {
  const existingText = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const existing = dotenv.parse(existingText);
  const nodeEnv = runtimeEnv.NODE_ENV || existing.NODE_ENV || 'development';
  if (nodeEnv !== 'development') {
    throw new Error('Demo setup is only available when NODE_ENV=development. No database or environment changes were made.');
  }

  const config = {
    NODE_ENV: 'development',
    ENABLE_DEMO_ACCOUNTS: 'true',
    DEMO_USER_EMAIL: runtimeEnv.DEMO_USER_EMAIL || existing.DEMO_USER_EMAIL || DEFAULTS.DEMO_USER_EMAIL,
    DEMO_ADMIN_EMAIL: runtimeEnv.DEMO_ADMIN_EMAIL || existing.DEMO_ADMIN_EMAIL || DEFAULTS.DEMO_ADMIN_EMAIL,
    DEMO_USER_PASSWORD: runtimeEnv.DEMO_USER_PASSWORD || existing.DEMO_USER_PASSWORD || newPassword(),
    DEMO_ADMIN_PASSWORD: runtimeEnv.DEMO_ADMIN_PASSWORD || existing.DEMO_ADMIN_PASSWORD || newPassword()
  };

  let updatedText = existingText;
  for (const [key, value] of Object.entries(config)) updatedText = setEnvValue(updatedText, key, value);
  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  fs.writeFileSync(envPath, updatedText, { encoding: 'utf8', mode: 0o600 });
  try { fs.chmodSync(envPath, 0o600); } catch { /* Windows ACLs are controlled by the current user. */ }

  const demoEnv = { ...runtimeEnv, ...existing, ...config, NODE_ENV: 'development', ENABLE_DEMO_ACCOUNTS: 'true' };
  seedSampleProducts({ db, logger });
  const result = await seedDemoAccounts({ env: demoEnv, db, logger });
  logger.log('Local Dia demo setup is complete. Generated passwords are stored only in your ignored .env file.');
  logger.log('Customer account: ' + config.DEMO_USER_EMAIL);
  logger.log('Demo administrator: ' + config.DEMO_ADMIN_EMAIL);
  logger.log('Open .env locally to read the generated passwords. Do not share or commit that file.');
  return { ...result, envPath, emails: { user: config.DEMO_USER_EMAIL, admin: config.DEMO_ADMIN_EMAIL } };
}

if (require.main === module) {
  setupDemoEnvironment().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { setupDemoEnvironment, newPassword, setEnvValue };
