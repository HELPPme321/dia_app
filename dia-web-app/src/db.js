'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const DEFAULT_DATABASE_PATH = path.join(__dirname, '..', 'data', 'dia.sqlite');

function createDatabase(databasePath = process.env.DATABASE_PATH || DEFAULT_DATABASE_PATH) {
  if (databasePath !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });
  }

  const db = new Database(databasePath);
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  if (databasePath !== ':memory:') db.pragma('journal_mode = WAL');

  db.exec(
    "CREATE TABLE IF NOT EXISTS users (" +
    "id TEXT PRIMARY KEY," +
    "email TEXT NOT NULL COLLATE NOCASE UNIQUE," +
    "username TEXT COLLATE NOCASE," +
    "google_sub TEXT UNIQUE," +
    "password_hash TEXT," +
    "name TEXT NOT NULL," +
    "picture_url TEXT," +
    "role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'))," +
    "status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled'))," +
    "is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1))," +
    "created_at TEXT NOT NULL," +
    "updated_at TEXT NOT NULL," +
    "last_login_at TEXT" +
    ");" +
    "CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);" +
    "CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role, status);" +
    "CREATE TABLE IF NOT EXISTS sessions (" +
    "token_hash TEXT PRIMARY KEY," +
    "user_id TEXT REFERENCES users(id) ON DELETE CASCADE," +
    "csrf_token TEXT NOT NULL," +
    "auth_method TEXT NOT NULL DEFAULT 'anonymous' CHECK (auth_method IN ('anonymous', 'google', 'admin', 'password'))," +
    "created_at INTEGER NOT NULL," +
    "last_seen_at INTEGER NOT NULL," +
    "expires_at INTEGER NOT NULL" +
    ");" +
    "CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);" +
    "CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);"
  );

  // Additive migration: existing users and sessions are preserved.
  const userColumns = db.prepare('PRAGMA table_info(users)').all().map((column) => column.name);
  if (!userColumns.includes('is_demo')) {
    db.exec("ALTER TABLE users ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1))");
  }
  if (!userColumns.includes('username')) {
    db.exec('ALTER TABLE users ADD COLUMN username TEXT COLLATE NOCASE');
  }
  // Older installations stored identifiers such as milesadmin in the email column.
  db.exec("UPDATE users SET username=lower(trim(email)) WHERE username IS NULL AND instr(email,'@')=0 AND trim(email)<>'' AND NOT EXISTS (SELECT 1 FROM users AS conflict WHERE conflict.username=lower(trim(users.email)) AND conflict.id<>users.id);");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_ci ON users(username COLLATE NOCASE) WHERE username IS NOT NULL AND username<>'';");

  const sessionColumns = db.prepare('PRAGMA table_info(sessions)').all().map((column) => column.name);
  if (!sessionColumns.includes('auth_method')) {
    db.exec("ALTER TABLE sessions ADD COLUMN auth_method TEXT NOT NULL DEFAULT 'anonymous'");
  }

  // Existing databases created before password sign-in only allow anonymous/google/admin.
  // Rebuild the session table to extend its CHECK constraint while preserving active sessions.
  const sessionSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='sessions'").get()?.sql || '';
  if (!sessionSchema.includes("'password'")) {
    db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        db.exec("ALTER TABLE sessions RENAME TO sessions_legacy");
        db.exec(
          "CREATE TABLE sessions (" +
          "token_hash TEXT PRIMARY KEY," +
          "user_id TEXT REFERENCES users(id) ON DELETE CASCADE," +
          "csrf_token TEXT NOT NULL," +
          "auth_method TEXT NOT NULL DEFAULT 'anonymous' CHECK (auth_method IN ('anonymous', 'google', 'admin', 'password'))," +
          "created_at INTEGER NOT NULL," +
          "last_seen_at INTEGER NOT NULL," +
          "expires_at INTEGER NOT NULL" +
          ")"
        );
        db.exec("INSERT INTO sessions(token_hash,user_id,csrf_token,auth_method,created_at,last_seen_at,expires_at) SELECT token_hash,user_id,csrf_token,auth_method,created_at,last_seen_at,expires_at FROM sessions_legacy");
        db.exec("DROP TABLE sessions_legacy");
      })();
    } finally {
      db.pragma('foreign_keys = ON');
    }
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id); CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);");

  db.exec(
    "CREATE TABLE IF NOT EXISTS products (" +
    "id TEXT PRIMARY KEY," +
    "name TEXT NOT NULL," +
    "category TEXT NOT NULL," +
    "description TEXT NOT NULL DEFAULT ''," +
    "price INTEGER NOT NULL CHECK (price >= 0)," +
    "cost_price INTEGER CHECK (cost_price IS NULL OR cost_price >= 0)," +
    "color TEXT NOT NULL DEFAULT 'Mixed'," +
    "sizes_json TEXT NOT NULL DEFAULT '[]'," +
    "image_url TEXT NOT NULL DEFAULT '/assets/dia-editorial.webp'," +
    "image_position TEXT NOT NULL DEFAULT 'center center'," +
    "tag TEXT NOT NULL DEFAULT 'New arrival'," +
    "stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0)," +
    "status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived'))," +
    "is_sample INTEGER NOT NULL DEFAULT 0 CHECK (is_sample IN (0,1))," +
    "created_at TEXT NOT NULL," +
    "updated_at TEXT NOT NULL" +
    ");" +
    "CREATE INDEX IF NOT EXISTS idx_products_status_category ON products(status, category);" +
    "CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock);" +
    "CREATE TABLE IF NOT EXISTS cart_items (" +
    "user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE," +
    "product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE," +
    "size TEXT NOT NULL," +
    "quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99)," +
    "created_at TEXT NOT NULL," +
    "updated_at TEXT NOT NULL," +
    "PRIMARY KEY (user_id, product_id, size)" +
    ");" +
    "CREATE TABLE IF NOT EXISTS orders (" +
    "id TEXT PRIMARY KEY," +
    "order_number TEXT NOT NULL UNIQUE," +
    "user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT," +
    "status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','processing','shipped','completed','cancelled','refunded'))," +
    "payment_status TEXT NOT NULL DEFAULT 'not_collected' CHECK (payment_status IN ('not_collected','paid','refunded'))," +
    "customer_name TEXT NOT NULL," +
    "customer_email TEXT NOT NULL," +
    "shipping_address TEXT NOT NULL," +
    "subtotal INTEGER NOT NULL CHECK (subtotal >= 0)," +
    "shipping INTEGER NOT NULL CHECK (shipping >= 0)," +
    "total INTEGER NOT NULL CHECK (total >= 0)," +
    "idempotency_key TEXT," +
    "created_at TEXT NOT NULL," +
    "updated_at TEXT NOT NULL" +
    ");" +
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency ON orders(user_id, idempotency_key);" +
    "CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at DESC);" +
    "CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at DESC);" +
    "CREATE TABLE IF NOT EXISTS order_items (" +
    "id TEXT PRIMARY KEY," +
    "order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE," +
    "product_id TEXT REFERENCES products(id) ON DELETE SET NULL," +
    "product_name TEXT NOT NULL," +
    "category TEXT NOT NULL," +
    "size TEXT NOT NULL," +
    "quantity INTEGER NOT NULL CHECK (quantity > 0)," +
    "unit_price INTEGER NOT NULL CHECK (unit_price >= 0)," +
    "unit_cost INTEGER CHECK (unit_cost IS NULL OR unit_cost >= 0)," +
    "line_total INTEGER NOT NULL CHECK (line_total >= 0)," +
    "created_at TEXT NOT NULL" +
    ");" +
    "CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);" +
    "CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);"
  );

  return db;
}

module.exports = { createDatabase, DEFAULT_DATABASE_PATH };
