# Ka Ndeke - SQLite + Backend + Frontend patch

This patch provides:
- Backend:
  - server.js (serves static frontend, initializes SQLite)
  - db.js (opens db/db- ka-ndeke.db and creates users table)
  - routes/users.js (register/login with JWT, deposit, withdraw, change balance)
  - routes/index.js

- Frontend:
  - public/index.html
  - public/style.css
  - public/app.js (register/login, deposit/withdraw, game logic wired to backend)

How to produce the zip (scripts below) or manually install:
1. Install dependencies:
   npm install express cors sqlite sqlite3 uuid bcryptjs jsonwebtoken dotenv

2. Add .env:
   JWT_SECRET=your_long_random_secret
   PORT=3000

3. Start:
   node server.js

4. Open:
   http://localhost:3000/

Security notes:
- JWT token stored in localStorage (convenient). For stronger security, use httpOnly cookies.
- Passwords are hashed with bcrypt.

Next steps:
- Add server-side logging, input validation libraries, error tracking.
- Replace prompt() UI with proper forms for better UX.
