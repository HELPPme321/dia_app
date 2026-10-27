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
    "google_sub TEXT UNIQUE," +
    "password_hash TEXT," +
    "name TEXT NOT NULL," +
    "picture_url TEXT," +
    "role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'))," +
    "status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled'))," +
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

  const columns = db.prepare('PRAGMA table_info(sessions)').all().map((column) => column.name);
  if (!columns.includes('auth_method')) {
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
  return db;
}

module.exports = { createDatabase, DEFAULT_DATABASE_PATH };
