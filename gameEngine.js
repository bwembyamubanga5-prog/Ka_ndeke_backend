function generateCrashPoint() {
  if (Math.random() < 0.7) {
    return 1.1 + Math.random() * 0.6;
  }
  return 2 + Math.random() * 3;
}

function calculateWin(bet, multiplier) {
  return bet * multiplier;
}

module.exports = { generateCrashPoint, calculateWin };
