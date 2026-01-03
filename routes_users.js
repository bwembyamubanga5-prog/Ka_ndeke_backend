const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "dev_jwt_secret";
const TOKEN_EXPIRES_IN = "7d";

// helper to get db
function getDb(req) {
  const db = req.app.locals.db;
  if (!db) throw new Error("DB not initialized");
  return db;
}

// create JWT
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRES_IN });
}

// auth middleware
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: "Missing Authorization header" });
  const parts = auth.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return res.status(401).json({ error: "Bad Authorization header" });
  try {
    const payload = jwt.verify(parts[1], JWT_SECRET);
    req.user = { id: payload.userId };
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// safe atomic balance change helper using a transaction
async function changeBalanceAtomic(db, userId, delta) {
  try {
    await db.run("BEGIN IMMEDIATE");
    const row = await db.get("SELECT balance FROM users WHERE id = ?", [userId]);
    if (!row) {
      await db.run("ROLLBACK");
      throw new Error("User not found");
    }
    const current = Number(row.balance || 0);
    const updated = current + Number(delta);
    if (updated < 0) {
      await db.run("ROLLBACK");
      throw new Error("Insufficient funds");
    }
    await db.run("UPDATE users SET balance = ?, updatedAt = ? WHERE id = ?", [updated, new Date().toISOString(), userId]);
    await db.run("COMMIT");
    const user = await db.get("SELECT id, username, email, balance, freeRounds, createdAt, updatedAt FROM users WHERE id = ?", [userId]);
    return user;
  } catch (err) {
    try { await db.run("ROLLBACK"); } catch (_) {}
    throw err;
  }
}

// Register: POST /api/auth/register
// body: { username, email, password }
router.post("/auth/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: "Missing fields" });

    const db = getDb(req);

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    const id = uuidv4();
    const now = new Date().toISOString();

    await db.run(
      `INSERT INTO users (id, username, email, password_hash, balance, freeRounds, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, username, email, hash, 0, 0, now, now]
    );

    const user = await db.get("SELECT id, username, email, balance, freeRounds FROM users WHERE id = ?", [id]);
    const token = signToken({ userId: id });

    return res.status(201).json({ token, user });
  } catch (err) {
    if (err && err.message && err.message.includes("UNIQUE constraint failed")) {
      return res.status(400).json({ error: "Username or email already in use" });
    }
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// Login: POST /api/auth/login
// body: { email, password }
router.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Missing fields" });

    const db = getDb(req);
    const row = await db.get("SELECT id, password_hash FROM users WHERE email = ?", [email]);
    if (!row) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const user = await db.get("SELECT id, username, email, balance, freeRounds FROM users WHERE id = ?", [row.id]);
    const token = signToken({ userId: row.id });
    return res.json({ token, user });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// Get current user: GET /api/users/me
router.get("/users/me", authMiddleware, async (req, res) => {
  try {
    const db = getDb(req);
    const user = await db.get("SELECT id, username, email, balance, freeRounds, createdAt, updatedAt FROM users WHERE id = ?", [req.user.id]);
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json(user);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// Deposit: POST /api/users/deposit
// body: { amount }
router.post("/users/deposit", authMiddleware, async (req, res) => {
  try {
    const amount = Number(req.body.amount);
    if (!(amount > 0)) return res.status(400).json({ error: "Amount must be > 0" });

    const db = getDb(req);
    const user = await changeBalanceAtomic(db, req.user.id, amount);
    return res.json(user);
  } catch (err) {
    if (err.message === "Insufficient funds") return res.status(400).json({ error: err.message });
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// Withdraw: POST /api/users/withdraw
// body: { amount }
router.post("/users/withdraw", authMiddleware, async (req, res) => {
  try {
    const amount = Number(req.body.amount);
    if (!(amount > 0)) return res.status(400).json({ error: "Amount must be > 0" });

    const db = getDb(req);
    const user = await changeBalanceAtomic(db, req.user.id, -amount);
    return res.json(user);
  } catch (err) {
    if (err.message === "Insufficient funds") return res.status(400).json({ error: err.message });
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// Endpoint to change balance by delta (signed) — useful for game bet/cashout atomically
// POST /api/users/balance/change
// body: { delta } (positive or negative)
router.post("/users/balance/change", authMiddleware, async (req, res) => {
  try {
    const delta = Number(req.body.delta);
    if (!Number.isFinite(delta)) return res.status(400).json({ error: "Invalid delta" });

    const db = getDb(req);
    const user = await changeBalanceAtomic(db, req.user.id, delta);
    return res.json(user);
  } catch (err) {
    if (err.message === "Insufficient funds") return res.status(400).json({ error: err.message });
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;