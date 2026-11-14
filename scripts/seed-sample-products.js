'use strict';

require('dotenv').config();
const { createDatabase } = require('../src/db');
const { PRODUCTS, ARCHIVED_PRODUCTS } = require('../src/products');

const ACTIVE_IDS = new Set(PRODUCTS.map((p) => p.id));

/**
 * Seeds and synchronizes the active catalog of 11 authentic Dia products.
 * Archives (does not delete) legacy sample products so that no wrong or repeated
 * image appears in the storefront. Never overwrites manual price/stock edits on existing products.
 */
function seedSampleProducts({ db: suppliedDb, logger = console } = {}) {
  const db = suppliedDb || createDatabase(process.env.DATABASE_PATH);
  const ownsDb = !suppliedDb;
  const created = [];
  const skipped = [];
  const updated = [];
  const archived = [];

  try {
    const now = new Date().toISOString();

    // 1. Archive any existing sample products not in the active 11
    const existingSamples = db.prepare('SELECT id, status FROM products WHERE is_sample = 1').all();
    for (const sample of existingSamples) {
      if (!ACTIVE_IDS.has(sample.id) && sample.status !== 'archived') {
        db.prepare('UPDATE products SET status = ?, updated_at = ? WHERE id = ?').run('archived', now, sample.id);
        archived.push(sample.id);
      }
    }

    // Also ensure known ARCHIVED_PRODUCTS are marked archived if present
    for (const arch of ARCHIVED_PRODUCTS) {
      if (!ACTIVE_IDS.has(arch.id)) {
        db.prepare("UPDATE products SET status = 'archived', updated_at = ? WHERE id = ? AND status <> 'archived'").run(now, arch.id);
      }
    }

    // 2. Insert or skip existing products (preserving manual edits)
    const insertStmt = db.prepare(
      'INSERT INTO products (id, name, category, description, price, cost_price, color, sizes_json, image_url, image_position, tag, stock, status, is_sample, created_at, updated_at) ' +
      "VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?)"
    );

    for (const product of PRODUCTS) {
      const existing = db.prepare('SELECT id, is_sample, image_url FROM products WHERE id = ?').get(product.id);
      if (existing) {
        skipped.push(product.id);
        continue;
      }

      insertStmt.run(
        product.id,
        product.name,
        product.category,
        product.description,
        product.price,
        product.color,
        JSON.stringify(product.sizes),
        product.image,
        product.imagePosition || 'center center',
        product.tag || 'New arrival',
        product.stock,
        now,
        now
      );
      created.push(product.id);
    }

    logger.log(`Active catalog synchronization complete:`);
    logger.log(`- Created: ${created.length}`);
    logger.log(`- Skipped (existing): ${skipped.length}`);
    logger.log(`- Archived legacy: ${archived.length}`);
    logger.log(`Total active products in catalog: ${PRODUCTS.length}`);

    return { created, skipped, updated, archived };
  } finally {
    if (ownsDb) db.close();
  }
}

if (require.main === module) {
  try {
    seedSampleProducts();
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exitCode = 1;
  }
}

module.exports = { seedSampleProducts };
