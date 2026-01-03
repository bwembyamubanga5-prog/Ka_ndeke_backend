require("dotenv").config();
const express = require("express");
const cors = require("cors");

const { initDb } = require("./db");
const routes = require("./routes");

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend from ./public
app.use(express.static("public"));

(async () => {
  try {
    const db = await initDb();
    app.locals.db = db;

    // mount API routes
    app.use("/api", routes);

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log("Ka Ndeke backend running on port", PORT);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
})();