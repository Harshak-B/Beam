// GET /api/brands   GET /api/brands/:id   PUT /api/brands/me (brand edits own profile)
const router = require("express").Router();
const { pool, withTransaction } = require("../config/db");
const { requireAuth, requireRole } = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const v = require("../utils/validate");
const ser = require("../utils/serializers");
const q = require("../services/queries");
const { CATEGORIES, CITIES } = require("../constants");

router.use(requireAuth);

router.get("/", asyncHandler(async (req, res) => {
  res.json((await q.listBrands()).map(ser.brand));
}));

router.put("/me", requireRole("brand"), asyncHandler(async (req, res) => {
  const b = req.body;
  const f = {
    name: v.personName(b.name, "Brand name"),
    industry: v.oneOf(b.industry, CATEGORIES, "Industry"),
    location: v.oneOf(b.location, CITIES, "Location"),
    about: v.optionalText(b.about, "About", 1000),
  };
  const email = v.email(b.email);
  try {
    await withTransaction(async (conn) => {
      const [e] = await conn.execute("SELECT id FROM users WHERE email = ? AND id <> ?", [email, req.user.id]);
      if (e.length) throw new AppError(409, "That email is already on Beam.");
      await conn.execute("UPDATE brands SET name = ?, industry = ?, location = ?, about = ? WHERE id = ?",
        [f.name, f.industry, f.location, f.about, req.user.refId]);
      await conn.execute("UPDATE users SET email = ? WHERE id = ?", [email, req.user.id]);
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") throw new AppError(409, "That email is already on Beam.");
    throw err;
  }
  const [rows] = await pool.execute("SELECT * FROM brands WHERE id = ?", [req.user.refId]);
  res.json(ser.brand(rows[0]));
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const [rows] = await pool.execute("SELECT * FROM brands WHERE id = ?", [v.idParam(req.params.id)]);
  if (!rows.length) throw new AppError(404, "Brand not found.");
  res.json(ser.brand(rows[0]));
}));

module.exports = router;
