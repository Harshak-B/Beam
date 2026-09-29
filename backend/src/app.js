const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const errorHandler = require("./middleware/errorHandler");

const app = express();
app.disable("x-powered-by");

// CORS is only needed when the frontend is served from a different origin than this API.
// Set CORS_ORIGIN in backend/.env (comma-separated) to allow those origins.
if (process.env.CORS_ORIGIN) {
  app.use(cors({ origin: process.env.CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean) }));
}
app.use(express.json({ limit: "100kb" }));

app.use("/api", require("./routes"));

// Serve the frontend (../frontend) so http://localhost:3000 works with a single process.
const frontendDir = path.join(__dirname, "..", "..", "frontend");
if (fs.existsSync(frontendDir)) app.use(express.static(frontendDir));

app.use(errorHandler);
module.exports = app;
