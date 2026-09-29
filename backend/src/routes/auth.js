// POST /api/auth/signup   POST /api/auth/login   GET /api/auth/me
const router = require("express").Router();
const bcrypt = require("bcryptjs");
const { pool, withTransaction } = require("../config/db");
const { requireAuth, signToken } = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const v = require("../utils/validate");
const { me } = require("../utils/serializers");
const { getUser } = require("../services/queries");
const { CATEGORIES, CITIES, SWATCH } = require("../constants");

// Compared against when the email is unknown, so "no such email" and "wrong password" take similar time.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

async function uniqueHandle(conn, name) {
  const base = "@" + (name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 16) || "newcreator");
  let candidate = base, n = 1;
  for (;;) {
    const [rows] = await conn.execute("SELECT id FROM influencers WHERE handle = ?", [candidate]);
    if (!rows.length) return candidate;
    candidate = base + ++n;
  }
}

router.post("/signup", asyncHandler(async (req, res) => {
  const name = v.personName(req.body.name, req.body.role === "brand" ? "Brand name" : "Name");
  const email = v.email(req.body.email);
  const password = v.password(req.body.password);
  const role = v.oneOf(req.body.role, ["brand", "influencer"], "Role");
  const hash = await bcrypt.hash(password, 10);
  const color = SWATCH[Math.floor(Math.random() * SWATCH.length)];
  const now = Date.now();

  let user;
  try {
    user = await withTransaction(async (conn) => {
      const [existing] = await conn.execute("SELECT id FROM users WHERE email = ?", [email]);
      if (existing.length) throw new AppError(409, "That email is already on Beam. Log in instead.");

      let brandId = null, influencerId = null;
      if (role === "brand") {
        const [r] = await conn.execute(
          "INSERT INTO brands (name, industry, location, color, about, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          [name, CATEGORIES[0], CITIES[0], color, "", now]
        );
        brandId = r.insertId;
      } else {
        const handle = await uniqueHandle(conn, name);
        const [r] = await conn.execute(
          `INSERT INTO influencers (handle, name, category, platforms, followers, engagement, location, rate, bio, color, completed_count, created_at)
           VALUES (?, ?, ?, ?, 0, 0, ?, 0, '', ?, 0, ?)`,
          [handle, name, CATEGORIES[0], JSON.stringify(["Instagram"]), CITIES[0], color, now]
        );
        influencerId = r.insertId;
      }
      const [u] = await conn.execute(
        "INSERT INTO users (email, password_hash, name, role, brand_id, influencer_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [email, hash, name, role, brandId, influencerId, now]
      );
      await conn.execute("INSERT INTO notifications (user_id, text, is_read, created_at) VALUES (?, ?, 0, ?)", [
        u.insertId,
        role === "brand"
          ? "Welcome to Beam. Post your first campaign to see ranked creators."
          : "Welcome to Beam. Fill in your followers and rate so briefs can score you.",
        now,
      ]);
      return { id: u.insertId, email, name, role, brand_id: brandId, influencer_id: influencerId };
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") throw new AppError(409, "That email is already on Beam. Log in instead.");
    throw err;
  }
  res.status(201).json({ token: signToken(user), user: me(user) });
}));

router.post("/login", asyncHandler(async (req, res) => {
  const email = v.email(req.body.email);
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const [rows] = await pool.execute("SELECT * FROM users WHERE email = ?", [email]);
  const user = rows[0];
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) throw new AppError(401, "Email or password is incorrect.");
  res.json({ token: signToken(user), user: me(user) });
}));

router.get("/me", requireAuth, asyncHandler(async (req, res) => {
  const user = await getUser(req.user.id);
  if (!user) throw new AppError(401, "Your account no longer exists.");
  res.json({ user: me(user) });
}));

module.exports = router;
