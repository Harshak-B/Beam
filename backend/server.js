// Entry point:  npm start   (from the backend/ folder)
const { validateEnv } = require("./src/config/env");
validateEnv(); // stops with a clear message if .env is incomplete

const app = require("./src/app");
const { pool } = require("./src/config/db");

const PORT = Number(process.env.PORT) || 3000;

(async () => {
  try {
    await pool.query("SELECT 1");
    await pool.query("SELECT COUNT(*) FROM users"); // fails if sql/schema.sql hasn't been run
    console.log(`✔ Connected to MySQL at ${process.env.DB_HOST}:${process.env.DB_PORT}, database "${process.env.DB_NAME}"`);
  } catch (err) {
    console.error("\n✖ Could not use the MySQL database.");
    if (err.code === "ER_ACCESS_DENIED_ERROR") console.error("  Wrong username or password — check DB_USER and DB_PASSWORD in backend/.env");
    else if (err.code === "ER_BAD_DB_ERROR") console.error(`  Database "${process.env.DB_NAME}" doesn't exist — run sql/schema.sql, or fix DB_NAME in backend/.env`);
    else if (err.code === "ER_NO_SUCH_TABLE") console.error("  Tables are missing — run sql/schema.sql first.");
    else if (err.code === "ECONNREFUSED") console.error("  MySQL isn't reachable — is it running? Check DB_HOST and DB_PORT in backend/.env");
    else console.error("  " + (err.code || "") + " " + err.message);
    process.exit(1);
  }

  const server = app.listen(PORT, () => console.log(`✔ Beam running at http://localhost:${PORT}`));
  const shutdown = () => server.close(() => pool.end().then(() => process.exit(0)));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
})();
