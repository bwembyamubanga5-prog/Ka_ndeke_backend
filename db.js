const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const path = require("path");
const fs = require("fs");

const DB_PATH = path.join(__dirname, "db", "ka-ndeke.db");

async function initDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database,
  });

  // Enable foreign keys
  await db.exec("PRAGMA foreign_keys = ON;");

  // If users table doesn't exist, create it with phone column
  // If it exists but uses 'email', migrate to the new schema using phone
  const table = await db.get("SELECT name, sql FROM sqlite_master WHERE type='table' AND name='users'");
  if (!table) {
    // create new users table with phone column
    await db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE,
        phone TEXT UNIQUE,
        password_hash TEXT,
        balance REAL DEFAULT 0,
        freeRounds INTEGER DEFAULT 0,
        createdAt TEXT,
        updatedAt TEXT
      );
    `);
    return db;
  }

  // table exists -> check columns
  const cols = await db.all("PRAGMA table_info(users)");
  const colNames = cols.map(c => c.name);
  const hasPhone = colNames.includes("phone");
  const hasEmail = colNames.includes("email");

  if (!hasPhone) {
    // perform migration:
    // 1) create users_new with the desired schema (phone instead of email)
    // 2) copy data from users to users_new mapping email -> phone where available
    // 3) drop old users table and rename users_new -> users

    await db.exec(`
      CREATE TABLE IF NOT EXISTS users_new (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE,
        phone TEXT UNIQUE,
        password_hash TEXT,
        balance REAL DEFAULT 0,
        freeRounds INTEGER DEFAULT 0,
        createdAt TEXT,
        updatedAt TEXT
      );
    `);

    if (hasEmail) {
      // copy email -> phone
      await db.exec(`
        INSERT OR IGNORE INTO users_new (id, username, phone, password_hash, balance, freeRounds, createdAt, updatedAt)
        SELECT id, username, email, password_hash, balance, freeRounds, createdAt, updatedAt FROM users;
      `);
    } else {
      // no email column to copy, copy other columns, phone will be NULL
      await db.exec(`
        INSERT OR IGNORE INTO users_new (id, username, phone, password_hash, balance, freeRounds, createdAt, updatedAt)
        SELECT id, username, NULL, password_hash, balance, freeRounds, createdAt, updatedAt FROM users;
      `);
    }

    // drop old table and rename
    await db.exec(`
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
    `);
  } else {
    // already has phone column; ensure table has the final schema (nothing to do)
  }

  // Ensure indexes/PRAGMA if needed (we already set UNIQUE on phone/username)
  return db;
}

module.exports = { initDb };

