// Frontend app: real register/login + deposit/withdraw + game persistence.
// API base (if frontend and backend on same host, '/api' is fine)
const API_BASE = '/api';

let balance = 0;
let multiplier = 1.0;
let bet = 0;
let timer = null;
let crashed = false;
let freePlays = 0;

const balanceEl = document.getElementById("balance");
const usernameEl = document.getElementById("username");
const multiplierEl = document.getElementById("multiplier");
const planeEl = document.getElementById("plane");
const statusEl = document.getElementById("status");
const freeRoundsEl = document.getElementById("freeRounds");
const betBtn = document.getElementById("betBtn");
const cashOutBtn = document.getElementById("cashOutBtn");

const loginBtn = document.getElementById("loginBtn");
const registerBtn = document.getElementById("registerBtn");
const logoutBtn = document.getElementById("logoutBtn");
const depositBtn = document.getElementById("depositBtn");
const withdrawBtn = document.getElementById("withdrawBtn");

function updateUI(){
  balanceEl.innerText = "K " + Number(balance || 0).toFixed(2);
  freeRoundsEl.innerText = "Free rounds: " + (freePlays || 0);
}
updateUI();

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  return token ? { 'Authorization': 'Bearer ' + token } : {};
}

// API helpers
async function apiAuthRequest(path, options = {}) {
  const headers = options.headers || {};
  Object.assign(headers, { 'Content-Type': 'application/json' });
  options.headers = headers;
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `Request failed (${res.status})`);
  }
  return res.json();
}

async function register(username, email, password) {
  return apiAuthRequest('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, email, password })
  });
}

async function login(email, password) {
  return apiAuthRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
}

async function getMe() {
  const headers = getAuthHeaders();
  const res = await fetch(`${API_BASE}/users/me`, { headers });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `Failed (${res.status})`);
  }
  return res.json();
}

async function deposit(amount) {
  const headers = Object.assign(getAuthHeaders(), { 'Content-Type': 'application/json' });
  const res = await fetch(`${API_BASE}/users/deposit`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ amount })
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `Deposit failed (${res.status})`);
  }
  return res.json();
}

async function withdraw(amount) {
  const headers = Object.assign(getAuthHeaders(), { 'Content-Type': 'application/json' });
  const res = await fetch(`${API_BASE}/users/withdraw`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ amount })
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `Withdraw failed (${res.status})`);
  }
  return res.json();
}

async function changeBalance(delta) {
  const headers = Object.assign(getAuthHeaders(), { 'Content-Type': 'application/json' });
  const res = await fetch(`${API_BASE}/users/balance/change`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ delta })
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `Balance change failed (${res.status})`);
  }
  return res.json();
}

// Auth UI handlers (forms via prompt for simplicity)
registerBtn.onclick = async () => {
  try {
    const username = prompt('Username:');
    if (!username) return;
    const email = prompt('Email:');
    if (!email) return;
    const password = prompt('Password:');
    if (!password) return;

    const { token, user } = await register(username, email, password);
    localStorage.setItem('token', token);
    onLoggedIn(user);
    alert('Registered and logged in');
  } catch (err) {
    console.error(err);
    alert('Register failed: ' + (err.message || ''));
  }
};

loginBtn.onclick = async () => {
  try {
    const email = prompt('Email:');
    if (!email) return;
    const password = prompt('Password:');
    if (!password) return;

    const { token, user } = await login(email, password);
    localStorage.setItem('token', token);
    onLoggedIn(user);
    alert('Logged in');
  } catch (err) {
    console.error(err);
    alert('Login failed: ' + (err.message || ''));
  }
};

logoutBtn.onclick = () => {
  localStorage.removeItem('token');
  onLoggedOut();
};

depositBtn.onclick = async () => {
  try {
    if (!localStorage.getItem('token')) return alert('Please log in to deposit');
    const amount = Number(document.getElementById('depositAmount').value);
    if (!(amount > 0)) return alert('Enter a deposit amount > 0');
    const user = await deposit(amount);
    balance = Number(user.balance);
    updateUI();
    alert('Deposit successful');
  } catch (err) {
    console.error(err);
    alert('Deposit failed: ' + (err.message || ''));
  }
};

withdrawBtn.onclick = async () => {
  try {
    if (!localStorage.getItem('token')) return alert('Please log in to withdraw');
    const amount = Number(document.getElementById('withdrawAmount').value);
    if (!(amount > 0)) return alert('Enter a withdraw amount > 0');
    const user = await withdraw(amount);
    balance = Number(user.balance);
    updateUI();
    alert('Withdraw successful');
  } catch (err) {
    console.error(err);
    alert('Withdraw failed: ' + (err.message || ''));
  }
};

function onLoggedIn(user) {
  usernameEl.innerText = user.username || user.email || 'Player';
  balance = Number(user.balance) || 0;
  freePlays = Number(user.freeRounds) || 0;
  loginBtn.style.display = 'none';
  registerBtn.style.display = 'none';
  logoutBtn.style.display = '';
  updateUI();
}

function onLoggedOut() {
  usernameEl.innerText = 'Guest';
  balance = 0;
  freePlays = 0;
  loginBtn.style.display = '';
  registerBtn.style.display = '';
  logoutBtn.style.display = 'none';
  updateUI();
}

// on load, try fetch current user if token exists
(async function init() {
  const token = localStorage.getItem('token');
  if (!token) return onLoggedOut();
  try {
    const user = await getMe();
    onLoggedIn(user);
  } catch (err) {
    console.warn('Invalid token or network error', err);
    localStorage.removeItem('token');
    onLoggedOut();
  }
})();

// Game logic (uses changeBalance delta endpoint to persist bets/wins)
betBtn.onclick = async () => {
  if (timer) return;
  bet = Number(document.getElementById("betAmount").value);
  if (bet <= 0) return alert("Enter a valid bet");

  let usingFreePlay = false;
  if (freePlays > 0) {
    freePlays--;
    usingFreePlay = true;
  } else {
    if (balance < bet) return alert("Insufficient balance");
    // persist deduction
    try {
      if (localStorage.getItem('token')) {
        const user = await changeBalance(-bet);
        balance = Number(user.balance);
      } else {
        balance -= bet; // demo fallback
      }
    } catch (err) {
      console.error('Failed to persist bet deduction', err);
      return alert('Could not place bet (server error)');
    }
  }

  multiplier = 1.0;
  crashed = false;
  planeEl.style.bottom = "10px";
  multiplierEl.innerText = "1.00x";
  statusEl.innerText = "✈️ Plane taking off...";
  cashOutBtn.disabled = false;

  let crashPoint = Math.random() < 0.7 ? 1.1 + Math.random()*0.6 : 2 + Math.random()*3;
  timer = setInterval(()=>{
    multiplier += 0.02;
    multiplierEl.innerText = multiplier.toFixed(2) + "x";
    planeEl.style.bottom = (parseFloat(planeEl.style.bottom||10)+2)+"px";
    if (multiplier >= crashPoint) crash();
  }, 100);

  updateUI();
};

cashOutBtn.onclick = async () => {
  if (crashed) return;
  clearInterval(timer);
  timer = null;

  let win = bet * multiplier;
  balance += win;
  statusEl.innerText = "✅ Cashed out at " + multiplier.toFixed(2) + "x → Won K " + win.toFixed(2);
  cashOutBtn.disabled = true;

  // persist win
  try {
    if (localStorage.getItem('token')) {
      const user = await changeBalance(win);
      balance = Number(user.balance);
      freePlays = Number(user.freeRounds) || freePlays;
    }
  } catch (err) {
    console.error('Failed to persist win', err);
    alert('Warning: could not save your win to server.');
  }

  updateUI();
};

function crash(){
  clearInterval(timer);
  timer = null;
  crashed = true;
  statusEl.innerText = "💥 CRASH at " + multiplier.toFixed(2) + "x — You lost";
  cashOutBtn.disabled = true;
  updateUI();
}

