// Small input validators. Each returns a cleaned value or throws AppError(400).
const AppError = require("./AppError");
const bad = (msg) => new AppError(400, msg);

function text(val, label, { min = 1, max = 255 } = {}) {
  const s = typeof val === "string" ? val.trim() : "";
  if (s.length < min) throw bad(min <= 1 ? `${label} is required.` : `${label} must be at least ${min} characters.`);
  if (s.length > max) throw bad(`${label} must be at most ${max} characters.`);
  return s;
}
function optionalText(val, label, max = 2000) {
  if (val == null || val === "") return "";
  if (typeof val !== "string") throw bad(`${label} must be text.`);
  const s = val.trim();
  if (s.length > max) throw bad(`${label} must be at most ${max} characters.`);
  return s;
}
function email(val) {
  const s = text(val, "Email", { max: 190 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw bad("That email doesn't look right.");
  return s;
}
function password(val) {
  if (typeof val !== "string" || val.length < 6) throw bad("Use at least 6 characters for the password.");
  if (val.length > 72) throw bad("Password must be at most 72 characters."); // bcrypt limit
  return val;
}
function personName(val, label = "Name") {
  const s = text(val, label, { min: 2, max: 80 });
  if (!/^[\p{L}][\p{L}\p{M} .'’-]*$/u.test(s)) throw bad(`${label} can only contain letters, spaces and . ' -`);
  return s;
}
function oneOf(val, list, label) {
  if (!list.includes(val)) throw bad(`${label} must be one of: ${list.join(", ")}.`);
  return val;
}
function toNumber(val, label) {
  if (typeof val === "string" && val.trim() !== "") val = Number(val);
  if (typeof val !== "number" || !Number.isFinite(val)) throw bad(`${label} must be a number.`);
  return val;
}
function int(val, label, { min = 0, max = 1e9 } = {}) {
  const n = toNumber(val, label);
  if (!Number.isInteger(n)) throw bad(`${label} must be a whole number.`);
  if (n < min || n > max) throw bad(`${label} must be between ${min} and ${max}.`);
  return n;
}
function decimal(val, label, { min = 0, max = 100 } = {}) {
  const n = toNumber(val, label);
  if (n < min || n > max) throw bad(`${label} must be between ${min} and ${max}.`);
  return Math.round(n * 100) / 100;
}
function stringArray(val, label, { min = 0, max = 10, itemMax = 100 } = {}) {
  if (!Array.isArray(val)) throw bad(`${label} must be a list.`);
  const out = val.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean);
  if (out.length < min) throw bad(`${label}: pick at least ${min}.`);
  if (out.length > max) throw bad(`${label}: at most ${max} items.`);
  if (out.some((x) => x.length > itemMax)) throw bad(`${label}: each item must be at most ${itemMax} characters.`);
  return out;
}
// URL parameter like /campaigns/:id — an unusable id simply means "not found".
function idParam(val) {
  const n = Number(val);
  if (!Number.isInteger(n) || n < 1) throw new AppError(404, "Not found.");
  return n;
}
// An id inside a JSON body — unusable means a bad request.
function idBody(val, label) {
  const n = Number(val);
  if (!Number.isInteger(n) || n < 1) throw bad(`${label} is required.`);
  return n;
}

module.exports = { text, optionalText, email, password, personName, oneOf, int, decimal, stringArray, idParam, idBody };
