const express = require("express");
const router = express.Router();

const { generateCrashPoint, calculateWin } = require("./gameEngine");
const { createGuest, getUser } = require("./users");

router.post("/guest", (req, res) => {
  const user = createGuest();
  res.json(user);
});

router.post("/start", (req, res) => {
  const { userId, bet } = req.body;
  const user = getUser(userId);

  if (!user) return res.status(400).json({ error: "Invalid user" });

  if (user.freeRounds > 0) {
    user.freeRounds--;
  } else {
    if (user.balance < bet)
      return res.status(400).json({ error: "Insufficient balance" });
    user.balance -= bet;
  }

  const crashPoint = generateCrashPoint();
  user.activeRound = { bet, crashPoint, active: true };

  res.json({ message: "Round started" });
});

router.post("/cashout", (req, res) => {
  const { userId, multiplier } = req.body;
  const user = getUser(userId);

  if (!user || !user.activeRound)
    return res.status(400).json({ error: "No active round" });

  if (multiplier >= user.activeRound.crashPoint) {
    user.activeRound = null;
    return res.json({ result: "crash", balance: user.balance });
  }

  const win = calculateWin(user.activeRound.bet, multiplier);
  user.balance += win;
  user.activeRound = null;

  res.json({ result: "win", win, balance: user.balance });
});

module.exports = router;
