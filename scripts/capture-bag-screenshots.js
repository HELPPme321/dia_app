'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');

async function main() {
  const outDir = path.join(__dirname, '..', 'screenshots');
  fs.mkdirSync(outDir, { recursive: true });

  const artifactDir = path.resolve('C:\\Users\\Lenovo\\.gemini\\antigravity\\brain\\5ada6bfe-a97e-4420-9f72-3d89d44110aa');
  try { fs.mkdirSync(artifactDir, { recursive: true }); } catch {}

  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const browser = await chromium.launch({
    executablePath: edgePath,
    headless: true
  });

  const sampleItems = [
    { productId: 'starburst-patch-cargo-denim', name: 'Starburst Patch Cargo Denim', size: 'M', quantity: 1, price: 3450, image: '/images/01-star-patch-denim-cargo.webp' },
    { productId: 'midnight-web-oversized-tee', name: 'Midnight Web Oversized Tee', size: 'L', quantity: 1, price: 1150, image: '/images/05-navy-spider-tee.webp' },
    { productId: 'noir-gold-smile-washed-tee', name: 'Noir Gold-Smile Washed Tee', size: 'S', quantity: 1, price: 1250, image: '/images/06-washed-black-lips-tee.webp' },
    { productId: 'papillon-print-boat-neck-tee', name: 'Papillon Print Boat-Neck Tee', size: 'M', quantity: 1, price: 1050, image: '/images/08-butterfly-white-tee.webp' },
    { productId: 'blanche-corset-puff-sleeve-dress', name: 'Blanche Corset Puff-Sleeve Dress', size: 'S', quantity: 1, price: 2850, image: '/images/09-white-corset-puff-dress.webp' },
    { productId: 'script-embroidered-wide-denim', name: 'Script Embroidered Wide Denim', size: 'XL', quantity: 1, price: 3650, image: '/images/10-script-embroidered-wide-jeans.webp' },
    { productId: 'relic-washed-gothic-cap', name: 'Relic Washed Gothic Cap', size: 'One size', quantity: 1, price: 890, image: '/images/11-washed-gothic-cap.webp' },
    { productId: 'ember-plaid-embroidered-overshirt', name: 'Ember Plaid Embroidered Overshirt', size: 'M', quantity: 1, price: 2450, image: '/images/02-model-plaid-flannel-look.webp' }
  ];

  const viewports = [
    { name: '1366x768', width: 1366, height: 768 },
    { name: '1920x1080', width: 1920, height: 1080 },
    { name: '390x844', width: 390, height: 844, isMobile: true }
  ];

  const itemCounts = [1, 3, 8];

  for (const vp of viewports) {
    const page = await browser.newPage({
      viewport: { width: vp.width, height: vp.height },
      isMobile: !!vp.isMobile
    });

    for (const count of itemCounts) {
      const activeCart = sampleItems.slice(0, count);

      await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
      await page.evaluate((items) => {
        localStorage.setItem('dia_guest_cart', JSON.stringify(items));
        const intro = document.getElementById('pageIntro');
        if (intro) intro.remove();
      }, activeCart);

      await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
      await page.evaluate(() => {
        const intro = document.getElementById('pageIntro');
        if (intro) intro.remove();
        const bag = document.getElementById('bagDrawer');
        if (bag) {
          bag.inert = false;
          bag.classList.add('open');
          bag.setAttribute('aria-hidden', 'false');
          document.getElementById('bagBackdrop').hidden = false;
        }
      });

      // Wait for items to be rendered and drawer animation
      await page.waitForTimeout(400);

      const filename = `bag-${count}items-${vp.name}.png`;
      const localPath = path.join(outDir, filename);
      await page.screenshot({ path: localPath });
      console.log(`Saved screenshot: ${filename} (${vp.width}x${vp.height})`);

      try {
        const artifactPath = path.join(artifactDir, filename);
        fs.copyFileSync(localPath, artifactPath);
      } catch (err) {
        console.warn('Could not copy to artifact dir:', err.message);
      }
    }

    await page.close();
  }

  await browser.close();
  console.log('Successfully captured all 9 screenshots!');
}

main().catch((err) => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
