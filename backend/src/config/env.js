// Loads backend/.env and checks that everything needed is present.
// Nothing here contains credentials — every value comes from the environment.
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

function validateEnv() {
  const problems = [];

  const missing = ["DB_HOST", "DB_PORT", "DB_USER", "DB_NAME"].filter((k) => !process.env[k]);
  // DB_PASSWORD may legitimately be empty (e.g. a default XAMPP root user), but it must be defined.
  if (process.env.DB_PASSWORD === undefined) missing.push("DB_PASSWORD");
  if (missing.length) problems.push("Missing in backend/.env: " + missing.join(", "));

  if (process.env.DB_PORT && !Number.isInteger(Number(process.env.DB_PORT))) {
    problems.push("DB_PORT must be a number (the MySQL default is 3306).");
  }

  if ((process.env.JWT_SECRET || "").length < 32) {
    problems.push(
      "JWT_SECRET must be a random string of at least 32 characters. Generate one with:\n" +
        "    node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\""
    );
  }

  if (problems.length) {
    console.error("\n✖ Configuration problem(s):\n  - " + problems.join("\n  - ") + "\n");
    process.exit(1);
  }
}

module.exports = { validateEnv };
