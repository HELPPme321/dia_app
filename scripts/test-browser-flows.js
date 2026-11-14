// scripts/test-browser-flows.js - Comprehensive Playwright Browser Testing for Dia
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 3000;
const SITE_DIR = path.resolve(__dirname, '..', 'site');

// Simple static server for testing
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2'
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';

  let filePath = path.join(SITE_DIR, reqPath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    const indexPath = path.join(filePath, 'index.html');
    if (fs.existsSync(indexPath)) {
      filePath = indexPath;
    }
  } else if (!fs.existsSync(filePath) && fs.existsSync(filePath + '.html')) {
    filePath = filePath + '.html';
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    const notFound = path.join(SITE_DIR, '404.html');
    if (fs.existsSync(notFound)) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(notFound));
      return;
    }
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Security-Policy': "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https://qdmbladogfxqlerlfcbv.supabase.co blob:; connect-src 'self' https://qdmbladogfxqlerlfcbv.supabase.co wss://qdmbladogfxqlerlfcbv.supabase.co https://cdn.jsdelivr.net; frame-ancestors 'none';"
  });
  res.end(fs.readFileSync(filePath));
});

server.listen(PORT, async () => {
  console.log(`Test server running at http://localhost:${PORT}`);
  let browser;
  let exitCode = 0;

  try {
    browser = await chromium.launch({
      executablePath: EDGE_PATH,
      headless: true
    });

    const context = await browser.newContext({
      viewport: { width: 1366, height: 768 }
    });

    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
        console.error('BROWSER ERROR:', msg.text());
      }
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
      console.error('PAGE ERROR:', err.message);
    });

    console.log('\n--- 1. Testing Storefront & Supabase Catalog Load ---');
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const title = await page.title();
    console.log('Page Title:', title);

    // Check catalog loaded
    const productCards = await page.$$('.product-card');
    console.log(`Loaded ${productCards.length} product cards in storefront`);
    if (productCards.length < 11) {
      throw new Error(`Expected at least 11 products, found ${productCards.length}`);
    }

    console.log('\n--- 2. Testing Filters & Search ---');
    // Test Category filter (e.g. Tees)
    const teesTab = await page.$('.filter-tab[data-category="Tees"]');
    if (teesTab) {
      await teesTab.click();
      await page.waitForTimeout(300);
      const filteredCards = await page.$$('.product-card');
      console.log(`Filtered to Tees: ${filteredCards.length} cards displayed`);
    }

    // Reset filters
    const resetBtn = await page.$('#resetFilters');
    if (resetBtn) {
      await resetBtn.click();
      await page.waitForTimeout(300);
      const resetCount = await page.$$('.product-card');
      console.log(`Reset filters: ${resetCount.length} cards restored`);
    }

    console.log('\n--- 3. Testing Quick View Dialog ---');
    const firstQuickView = await page.$('.product-card [data-quickview]');
    if (firstQuickView) {
      await firstQuickView.click();
      await page.waitForTimeout(500);
      const qvOpen = await page.$eval('#quickViewDialog', (d) => d.open);
      console.log('Quick View modal opened:', qvOpen);
      if (!qvOpen) throw new Error('Quick view dialog failed to open');
      await page.click('#quickViewClose');
      await page.waitForTimeout(300);
    }

    console.log('\n--- 4. Testing Instant Add to Bag & Slide-out Drawer ---');
    const addBtn = await page.$('.product-card [data-add]');
    if (addBtn) {
      await addBtn.click();
      await page.waitForTimeout(400);

      const bagOpen = await page.$eval('#bagDrawer', (b) => b.classList.contains('open'));
      const bagBadgeText = await page.$eval('#bagCount', (el) => el.textContent.trim());
      console.log(`Bag drawer opened: ${bagOpen}, Bag item count: ${bagBadgeText}`);
      if (!bagOpen || bagBadgeText !== '1') {
        throw new Error('Bag did not update optimistically or drawer did not open');
      }

      // Check localStorage for guest cart
      const guestCartJson = await page.evaluate(() => localStorage.getItem('dia_cart') || localStorage.getItem('dia_guest_cart'));
      console.log('Guest cart persisted in localStorage:', guestCartJson ? 'YES' : 'NO');
      if (!guestCartJson) throw new Error('Guest cart was not saved to localStorage');

      // Test quantity increment
      await page.click('[data-inc]');
      await page.waitForTimeout(200);
      const newBadge = await page.$eval('#bagCount', (el) => el.textContent.trim());
      console.log(`Incremented quantity: new count is ${newBadge}`);
      if (newBadge !== '2') throw new Error('Bag quantity increment failed');

      // Close bag
      await page.click('#bagClose');
      await page.waitForTimeout(300);
    }

    console.log('\n--- 5. Testing Newsletter Signup (RPC subscribe_newsletter) ---');
    await page.fill('#newsletterEmail', 'shopper-test@dia-atelier.com');
    await page.click('#newsletterForm button');
    await page.waitForTimeout(800);
    const newsletterStatus = await page.$eval('#newsletterStatus', (el) => el.textContent.trim());
    console.log('Newsletter status output:', newsletterStatus);

    console.log('\n--- 6. Testing Clean URLs & Client Initialization Across All Pages ---');
    const publicPages = ['/', '/login', '/register', '/admin/login', '/forgot-password', '/reset-password'];
    for (const p of publicPages) {
      const resp = await page.goto(`http://localhost:${PORT}${p}`, { waitUntil: 'load' });
      console.log(`GET ${p} -> Status ${resp.status()}`);

      // Verify that window.diaSupabase exists and has .auth
      const clientStatus = await page.evaluate(() => {
        const hasClient = typeof window.diaSupabase !== 'undefined' && window.diaSupabase !== null;
        const hasAuth = hasClient && typeof window.diaSupabase.auth !== 'undefined' && window.diaSupabase.auth !== null;
        const configDefined = typeof window.DIA_SUPABASE_CONFIG !== 'undefined';
        return { hasClient, hasAuth, configDefined };
      });

      console.log(`  → ${p}: configDefined=${clientStatus.configDefined}, diaSupabase=${clientStatus.hasClient}, diaSupabase.auth=${clientStatus.hasAuth}`);
      if (!clientStatus.hasClient || !clientStatus.hasAuth) {
        throw new Error(`Supabase client or .auth missing on ${p}`);
      }
    }

    // Test protected pages redirect when unauthenticated
    console.log('\n--- 6b. Testing Protected Pages Auth Gate & Redirects ---');
    await page.goto(`http://localhost:${PORT}/dashboard`, { waitUntil: 'networkidle' });
    console.log(`Unauthenticated /dashboard redirected to: ${page.url()}`);
    if (!page.url().includes('/login')) {
      throw new Error('/dashboard did not redirect to /login');
    }

    await page.goto(`http://localhost:${PORT}/admin`, { waitUntil: 'networkidle' });
    console.log(`Unauthenticated /admin redirected to: ${page.url()}`);
    if (!page.url().includes('/admin/login')) {
      throw new Error('/admin did not redirect to /admin/login');
    }

    console.log('\n--- 7. Checking for Console Errors or Auth Failures ---');
    const authErrors = consoleErrors.filter((e) => e.includes("reading 'auth'") || e.includes('Cannot read properties of null'));
    if (authErrors.length > 0) {
      console.error('Fatal auth initialization errors found:', authErrors);
      throw new Error('Found "Cannot read properties of null (reading \'auth\')" error!');
    }
    const cspErrors = consoleErrors.filter((e) => e.includes('Content Security Policy') || e.includes('refused to execute') || e.includes('refused to load'));
    if (cspErrors.length > 0) {
      console.error('CSP Violations detected:', cspErrors);
      throw new Error('Found Content Security Policy violations!');
    }
    console.log('Zero auth errors or CSP violations detected. Supabase client initialized cleanly on all pages.');

    console.log('\n✅ ALL BROWSER AUTOMATION FLOWS VERIFIED SUCCESSFULLY!');
  } catch (err) {
    console.error('Test execution failed:', err);
    exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.close();
    process.exit(exitCode);
  }
});
