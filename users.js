const { v4: uuidv4 } = require("uuid");
const users = {};

function createGuest() {
  const id = uuidv4();
  users[id] = {
    id,
    balance: 1000,
    freeRounds: 3,
    activeRound: null
  };
  return users[id];
}

function getUser(id) {
  return users[id];
}

module.exports = { createGuest, getUser };
