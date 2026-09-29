// GET /api/influencers (brands)   GET /api/influencers/:id   PUT /api/influencers/me (creator edits own profile)
const router = require("express").Router();
const { pool, withTransaction } = require("../config/db");
const { requireAuth, requireRole } = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const v = require("../utils/validate");
const ser = require("../utils/serializers");
const q = require("../services/queries");
const { recalcScores } = require("../services/scores");
const { CATEGORIES, PLATFORMS, CITIES } = require("../constants");

router.use(requireAuth);

router.get("/", requireRole("brand"), asyncHandler(async (req, res) => {
  res.json((await q.listInfluencers(req.user)).map(ser.influencer));
}));

// Must be declared before "/:id" so "me" isn't treated as an id.
router.put("/me", requireRole("influencer"), asyncHandler(async (req, res) => {
  const b = req.body;
  let handle = v.text(b.handle, "Handle", { min: 2, max: 40 });
  if (handle[0] !== "@") handle = "@" + handle;
  if (!/^@[A-Za-z0-9._]{2,39}$/.test(handle)) throw new AppError(400, "Handle can only use letters, numbers, dots and underscores.");
  const f = {
    name: v.personName(b.name),
    category: v.oneOf(b.category, CATEGORIES, "Category"),
    location: v.oneOf(b.location, CITIES, "Location"),
    followers: v.int(b.followers, "Followers"),
    engagement: v.decimal(b.engagement, "Engagement rate", { min: 0, max: 100 }),
    rate: v.int(b.rate, "Expected rate"),
    platforms: v.stringArray(b.platforms, "Platforms", { min: 1, max: PLATFORMS.length }),
    bio: v.optionalText(b.bio, "Bio", 1000),
  };
  if (f.platforms.some((p) => !PLATFORMS.includes(p))) throw new AppError(400, "Unknown platform.");
  const email = v.email(b.email);

  try {
    await withTransaction(async (conn) => {
      const [h] = await conn.execute("SELECT id FROM influencers WHERE handle = ? AND id <> ?", [handle, req.user.refId]);
      if (h.length) throw new AppError(409, "That handle is already taken.");
      const [e] = await conn.execute("SELECT id FROM users WHERE email = ? AND id <> ?", [email, req.user.id]);
      if (e.length) throw new AppError(409, "That email is already on Beam.");

      await conn.execute(
        `UPDATE influencers SET handle = ?, name = ?, category = ?, location = ?, followers = ?, engagement = ?, rate = ?, platforms = ?, bio = ?
          WHERE id = ?`,
        [handle, f.name, f.category, f.location, f.followers, f.engagement, f.rate, JSON.stringify(f.platforms), f.bio, req.user.refId]
      );
      await conn.execute("UPDATE users SET email = ?, name = ? WHERE id = ?", [email, f.name, req.user.id]);
      await recalcScores(conn, { influencerId: req.user.refId });
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") throw new AppError(409, "That handle or email is already in use.");
    throw err;
  }
  const [rows] = await pool.execute("SELECT * FROM influencers WHERE id = ?", [req.user.refId]);
  res.json(ser.influencer(rows[0]));
}));

// Brands can open any creator; a creator can only open themselves.
router.get("/:id", asyncHandler(async (req, res) => {
  const id = v.idParam(req.params.id);
  if (req.user.role !== "brand" && id !== req.user.refId) throw new AppError(404, "Creator not found.");
  const [rows] = await pool.execute("SELECT * FROM influencers WHERE id = ?", [id]);
  if (!rows.length) throw new AppError(404, "Creator not found.");
  res.json(ser.influencer(rows[0]));
}));

module.exports = router;
