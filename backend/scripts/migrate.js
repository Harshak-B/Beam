/**
 * migrate.js — runs sql/schema.sql against the connected MySQL database.
 * Safe to run multiple times (all CREATE TABLE statements use IF NOT EXISTS).
 *
 * Called automatically by server.js on Railway startup.
 * Can also be run manually:  node backend/scripts/migrate.js
 *
 * Exports: migrate()  — async function, resolves when done, throws on error.
 */
const path = require("path");
const fs   = require("fs");

async function migrate() {
  const mysql = require("mysql2/promise");

  const schemaPath = path.join(__dirname, "..", "sql", "schema.sql");
  let sql = fs.readFileSync(schemaPath, "utf8");

  // Railway provides a pre-created database, so strip the
  // CREATE DATABASE … and USE … lines — they are not needed
  // and would error if the DB name differs from "beam".
  sql = sql
    .replace(/CREATE DATABASE[^;]+;/gi, "")
    .replace(/USE\s+`[^`]+`\s*;/gi, "");

  // Split on semicolons and skip blank / comment-only chunks.
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST,
    port:     Number(process.env.DB_PORT),
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  try {
    for (const stmt of statements) {
      await conn.execute(stmt);
    }
    console.log("✔ Database schema is up to date.");
  } finally {
    await conn.end();
  }
}

// When invoked directly (node scripts/migrate.js), run immediately.
if (require.main === module) {
  require("../src/config/env").validateEnv();
  migrate().catch((err) => {
    console.error("✖ Migration failed:", err.message);
    process.exit(1);
  });
}

module.exports = { migrate };
