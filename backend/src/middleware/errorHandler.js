const AppError = require("../utils/AppError");

// MySQL / network error codes that mean "the database is unreachable or misconfigured".
const DB_DOWN = new Set([
  "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "PROTOCOL_CONNECTION_LOST", "ER_ACCESS_DENIED_ERROR",
  "ER_BAD_DB_ERROR", "ER_CON_COUNT_ERROR", "ER_NO_SUCH_TABLE",
]);

// Last stop for every error. Real details are logged on the server only; the
// client never sees SQL text, table names, or stack traces.
// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof AppError) return res.status(err.status).json({ error: err.message });
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Request body is not valid JSON." });
  if (err.type === "entity.too.large") return res.status(413).json({ error: "Request body is too large." });

  if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "That record already exists." });
  if (err.code === "ER_NO_REFERENCED_ROW_2" || err.code === "ER_ROW_IS_REFERENCED_2") {
    return res.status(409).json({ error: "That record refers to something that doesn't exist or is still in use." });
  }

  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} →`, err);

  if (DB_DOWN.has(err.code)) {
    return res.status(503).json({ error: "The database is unavailable right now. Please try again shortly." });
  }
  res.status(500).json({ error: "Something went wrong on our side." });
};
