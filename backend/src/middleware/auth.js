const jwt = require("jsonwebtoken");
const AppError = require("../utils/AppError");

// Requires "Authorization: Bearer <token>". Sets req.user = { id, role, refId }.
// refId is the brand id (brands) or influencer id (creators) that the user owns.
function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization || "").split(" ");
  if (scheme !== "Bearer" || !token) return next(new AppError(401, "Please log in."));
  try {
    const p = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: Number(p.sub), role: p.role, refId: Number(p.ref) };
    next();
  } catch (_) {
    next(new AppError(401, "Your session has expired. Please log in again."));
  }
}

function requireRole(role) {
  return (req, res, next) =>
    req.user && req.user.role === role
      ? next()
      : next(new AppError(403, role === "brand" ? "Only brands can do that." : "Only creators can do that."));
}

function signToken(userRow) {
  const ref = userRow.role === "brand" ? userRow.brand_id : userRow.influencer_id;
  return jwt.sign({ role: userRow.role, ref }, process.env.JWT_SECRET, { subject: String(userRow.id), expiresIn: "7d" });
}

module.exports = { requireAuth, requireRole, signToken };
