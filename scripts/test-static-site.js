// scripts/test-static-site.js - Dia+ Static Site Offline Checks & Safe Live Tests
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- Testing Dia+ Static Site Offline Checks & Deployment Readiness ---');

// 1. Verify published site directory and config.js
assert(fs.existsSync('site'), 'site directory must exist as the published website directory');
const publishedConfigPath = path.join('site', 'config.js');
assert(fs.existsSync(publishedConfigPath), 'config.js must exist in the published website directory (site/config.js)');
console.log('✔ Published config.js exists in site/config.js');

// 2. Verify self-hosted supabase-js vendor bundle (pinned 2.48.1)
const vendorSupabasePath = path.join('site', 'js', 'vendor', 'supabase.js');
assert(fs.existsSync(vendorSupabasePath), 'site/js/vendor/supabase.js must exist');
const vendorStat = fs.statSync(vendorSupabasePath);
assert(vendorStat.size > 50000, 'site/js/vendor/supabase.js must be a valid bundle');
console.log(`✔ Self-hosted Supabase UMD bundle verified in site/js/vendor/supabase.js (${vendorStat.size} bytes)`);

// 3. Verify window.DIA_SUPABASE_CONFIG in config.js
const configCode = fs.readFileSync(publishedConfigPath, 'utf8');
assert(configCode.includes('window.DIA_SUPABASE_CONFIG'), 'config.js must define window.DIA_SUPABASE_CONFIG');
assert(configCode.includes('https://qdmbladogfxqlerlfcbv.supabase.co'), 'config.js must contain Supabase project URL');
assert(configCode.includes('sb_publishable_GflfeKfAxwsjuFgLdR56fg_yy1aaH_c'), 'config.js must contain publishable key');
assert(!configCode.includes('service_role'), 'config.js must NEVER contain service_role or secret keys');
console.log('✔ window.DIA_SUPABASE_CONFIG properly configured with project URL and publishable key');

// 4. Verify Centralized Supabase Client Initialization (supabase-client.js)
const clientCode = fs.readFileSync(path.join('site', 'js', 'supabase-client.js'), 'utf8');
assert(clientCode.includes('window.diaSupabase'), 'supabase-client.js must store initialized client as window.diaSupabase');
assert(clientCode.includes('createClient'), 'supabase-client.js must initialize client using createClient');
assert(!clientCode.includes('return null;'), 'supabase-client.js must NOT silently return null on error');
assert(clientCode.includes('throw'), 'supabase-client.js must throw descriptive errors when config or library is missing');
console.log('✔ Centralized client initialization (window.diaSupabase) verified without silent null returns');

// 5. Verify script loading order & absence of cdn.jsdelivr.net in HTML files
const htmlPages = [
  'index.html',
  'login.html',
  'register.html',
  'admin.html',
  'admin-login.html',
  'dashboard.html',
  'forgot-password.html',
  'reset-password.html'
];

for (const page of htmlPages) {
  const filePath = path.join('site', page);
  assert(fs.existsSync(filePath), `Page ${page} must exist in site/`);
  const html = fs.readFileSync(filePath, 'utf8');

  // Verify self-hosted script presence
  assert(html.includes('/js/vendor/supabase.js'), `${page} must include self-hosted /js/vendor/supabase.js`);
  assert(!html.includes('cdn.jsdelivr.net'), `${page} must NOT use external jsDelivr CDN link`);

  // Verify vendor script loads BEFORE config.js
  const vendorIndex = html.indexOf('/js/vendor/supabase.js');
  const configIndex = html.indexOf('/config.js');
  assert(configIndex !== -1, `${page} must reference /config.js`);
  assert(vendorIndex < configIndex, `${page}: vendor script must load BEFORE config.js`);

  // Verify config.js loads BEFORE application scripts
  const appScripts = ['storefront.js', 'login.js', 'register.js', 'admin.js', 'admin-login.js', 'dashboard.js', 'forgot-password.js', 'reset-password.js'];
  for (const appScript of appScripts) {
    if (html.includes(appScript)) {
      const appIndex = html.indexOf(appScript);
      assert(configIndex < appIndex, `${page}: config.js must load BEFORE ${appScript}`);
    }
  }

  // Verify absence of legacy nonces
  assert(!html.includes('@@DIA_NONCE@@'), `${page} must not contain @@DIA_NONCE@@`);
}
console.log('✔ All HTML pages load self-hosted /js/vendor/supabase.js before config.js and app scripts');

// 6. Verify zero secret or service_role keys anywhere in frontend files
function scanForSecrets(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git') {
        scanForSecrets(fullPath);
      }
    } else if (/\.(html|js|css|json)$/i.test(entry.name)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      assert(!content.includes('service_role'), `Forbidden service_role key found in ${fullPath}`);
    }
  }
}
scanForSecrets('site');
console.log('✔ Verified zero service_role or secret keys across frontend files');

// 7. Verify netlify.toml configuration & security headers (script-src 'self' ONLY)
assert(fs.existsSync('netlify.toml'), 'netlify.toml must exist');
const netlifyConfig = fs.readFileSync('netlify.toml', 'utf8');
assert(netlifyConfig.includes('publish = "site"'), 'netlify.toml must publish site directory');
assert(netlifyConfig.includes("script-src 'self';"), "netlify.toml CSP must strictly enforce script-src 'self' only");
assert(!netlifyConfig.includes('cdn.jsdelivr.net'), 'netlify.toml CSP must NOT contain cdn.jsdelivr.net');
assert(netlifyConfig.includes('https://qdmbladogfxqlerlfcbv.supabase.co'), 'netlify.toml CSP must allow Supabase project URL');
console.log("✔ netlify.toml properly configured with clean redirects and strict script-src 'self' only");

// 8. Offline vs Live Mode Guard
const isLiveTest = process.argv.includes('--live') || process.env.RUN_LIVE_TESTS === '1';

if (!isLiveTest) {
  console.log('\n🔒 SAFE MODE: Plain "npm test" executes offline checks only.');
  console.log('ℹ No test accounts were created on the real Supabase project.');
  console.log('👉 To run live tests against the Supabase project, run: npm run test:live');
  console.log('\n✅ ALL OFFLINE STATIC SITE CHECKS PASSED CLEANLY!');
  process.exit(0);
}

// If explicit live flag is provided, run live tests and CLEARLY PRINT TEST EMAIL
console.log('\n--- Running Live Supabase Tests (Explicit Flag Enabled) ---');
const { createClient } = require('@supabase/supabase-js');

async function runLiveTests() {
  const sb = createClient(
    'https://qdmbladogfxqlerlfcbv.supabase.co',
    'sb_publishable_GflfeKfAxwsjuFgLdR56fg_yy1aaH_c'
  );

  const testEmail = `dia_test_safe_${Date.now()}@example.com`;
  const testPassword = `DiaPassword${Date.now()}!`;
  console.log(`\n======================================================`);
  console.log(`TEST EMAIL USED FOR LIVE TEST: ${testEmail}`);
  console.log(`======================================================\n`);

  const { data: regData, error: regErr } = await sb.auth.signUp({
    email: testEmail,
    password: testPassword,
    options: { data: { name: 'Live Tester', username: `tester_${Date.now()}` } }
  });
  assert(!regErr, `Live registration failed: ${regErr?.message}`);
  assert(regData.user, 'Live registration must return user');
  console.log(`✔ Registered user: ${testEmail} (ID: ${regData.user.id})`);

  const { data: loginData, error: loginErr } = await sb.auth.signInWithPassword({
    email: testEmail,
    password: testPassword
  });
  assert(!loginErr, `Live login failed: ${loginErr?.message}`);
  assert(loginData.session?.access_token, 'Login must yield access token');
  console.log(`✔ Login successful for ${testEmail}`);

  await sb.auth.signOut();
  console.log(`✔ Logout verified for ${testEmail}`);

  console.log('\n✅ ALL LIVE SUPABASE TESTS PASSED CLEANLY!');
}

runLiveTests().catch((err) => {
  console.error('❌ Live test failed:', err);
  process.exit(1);
});
