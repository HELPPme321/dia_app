'use strict';

require('dotenv').config();
const { createDatabase } = require('../src/db');
const { PRODUCTS } = require('../src/products');

const SAMPLE_STOCK = 12;
const POSITIONS = {
  'essential-hoodie': 'center 43%',
  'everyday-tee': '76% 39%',
  'core-cap': '36% 81%',
  'weekend-layer': '41% 53%'
};

/**
 * Imports the sample catalog. Existing rows are never overwritten; only a known
 * generic image placeholder on a sample row may be refreshed with current artwork.
 */
function seedSampleProducts({ db: suppliedDb, logger = console } = {}) {
  const db = suppliedDb || createDatabase(process.env.DATABASE_PATH);
  const ownsDb = !suppliedDb;
  const created = [];
  const skipped = [];
  try {
    for (const product of PRODUCTS) {
      const existing = db.prepare('SELECT id,is_sample,image_url FROM products WHERE id=?').get(product.id);
      if (existing) {
        // Refresh only untouched sample placeholders. Any administrator-edited image remains intact.
        if (existing.is_sample === 1 && existing.image_url === '/assets/dia-editorial.webp') {
          db.prepare('UPDATE products SET image_url=?,image_position=?,updated_at=? WHERE id=? AND is_sample=1 AND image_url=?')
            .run(product.image || '/assets/dia-editorial.webp', POSITIONS[product.id] || 'center center', new Date().toISOString(), product.id, '/assets/dia-editorial.webp');
        }
        skipped.push(product.id);
        continue;
      }
      const now = new Date().toISOString();
      db.prepare(
        "INSERT INTO products(id,name,category,description,price,cost_price,color,sizes_json,image_url,image_position,tag,stock,status,is_sample,created_at,updated_at) " +
        "VALUES(?,?,?,?,?,NULL,?,?,?,?,?,?,'active',1,?,?)"
      ).run(
        product.id, product.name, product.category, product.description, product.price,
        product.color, JSON.stringify(product.sizes), product.image || '/assets/dia-editorial.webp',
        POSITIONS[product.id] || 'center center', product.tag || 'Sample item', SAMPLE_STOCK, now, now
      );
      created.push(product.id);
    }
    logger.log('Sample catalog seed complete: ' + created.length + ' created, ' + skipped.length + ' already present.');
    logger.log('Sample products are marked is_sample=1. Costs are unknown and intentionally left blank; set cost prices before estimating gross profit.');
    return { created, skipped };
  } finally {
    if (ownsDb) db.close();
  }
}

if (require.main === module) {
  try {
    seedSampleProducts();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { seedSampleProducts };
