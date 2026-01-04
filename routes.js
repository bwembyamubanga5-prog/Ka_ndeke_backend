// routes.js — compatibility shim that delegates to routes-index.js
module.exports = require('./routes-index');
const express = require("express");
const path = require("path");
const router = express.Router();

// robust import of the server-side game engine
const gameEnginePath = path.join(__dirname, "..", "gameEngine");
console.log("DEBUG: routes/index __dirname =", __dirname);
console.log("DEBUG: attempting require of gameEngine at", gameEnginePath);

let generateCrashPoint;
let computePayout;
try {
  const ge = require(gameEnginePath);
  generateCrashPoint = ge.generateCrashPoint;
  computePayout = ge.computePayout;
  console.log("DEBUG: loaded gameEngine OK");
} catch (err) {
  console.error("ERROR: failed to require gameEngine from", gameEnginePath, err && err.stack ? err.stack : err);
  // don't throw so the server can still boot; the game endpoints will return errors
  generateCrashPoint = null;
  computePayout = null;
}

// health endpoint for frontend probe
router.get("/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

/**
 * GET /api/game/round
 * Returns a freshly generated crash point for a round if gameEngine is available.
 */
router.get("/game/round", (req, res) => {
  try {
    if (!generateCrashPoint) return res.status(500).json({ error: "Game engine not available on server" });
    const crashPoint = generateCrashPoint();
    return res.json({ crashPoint });
  } catch (err) {
    console.error("Error generating crash point:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /api/game/payout
 * Body: { bet: number, multiplier: number }
 * Returns calculated payout for the given bet and multiplier.
 */
router.post("/game/payout", express.json(), (req, res) => {
  try {
    if (!computePayout) return res.status(500).json({ error: "Game engine not available on server" });
    const { bet, multiplier } = req.body;
    if (bet == null || multiplier == null) {
      return res.status(400).json({ error: "Missing 'bet' or 'multiplier' in request body" });
    }
    const payout = computePayout(bet, multiplier);
    return res.json({ payout });
  } catch (err) {
    console.error("Error computing payout:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// mount auth & user endpoints under /api/* (keeps existing routes/users.js)
const users = require("./users");
router.use("/", users);

module.exports = router;
