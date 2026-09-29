// MySQL connection pool (mysql2). Credentials come ONLY from environment variables
// (backend/.env) — nothing is hardcoded here.
require("./env"); // make sure .env has been loaded before the pool reads process.env
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: "utf8mb4",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  decimalNumbers: true, // return DECIMAL columns as numbers, not strings
});

/**
 * Run several queries as one all-or-nothing unit.
 *   await withTransaction(async (conn) => { await conn.execute(...); ... });
 * Commits if the callback finishes, rolls back if it throws.
 */
async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch (_) { /* connection may already be gone */ }
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, withTransaction };
