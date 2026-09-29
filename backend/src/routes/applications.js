// GET/POST /api/applications   GET/PUT/DELETE /api/applications/:id
const router = require("express").Router();
const { pool, withTransaction } = require("../config/db");
const { requireAuth, requireRole } = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const v = require("../utils/validate");
const ser = require("../utils/serializers");
const q = require("../services/queries");
const { matchScore } = require("../utils/matchScore");
const { notifyUsers, userIdsForBrand, userIdsForInfluencer } = require("../services/notify");
const { money } = require("../utils/format");
const { APP_STATUSES, STAGE_LABEL, TRANSITIONS } = require("../constants");

router.use(requireAuth);

router.get("/", asyncHandler(async (req, res) => {
  res.json((await q.listApplications(req.user)).map(ser.application));
}));

// One application, with its status history. Visible to the creator who sent it or the brand that owns the campaign.
router.get("/:id", asyncHandler(async (req, res) => {
  const id = v.idParam(req.params.id);
  const [rows] = await pool.execute(
    "SELECT a.*, c.brand_id FROM applications a JOIN campaigns c ON c.id = a.campaign_id WHERE a.id = ?", [id]);
  const a = rows[0];
  const allowed = a && (req.user.role === "brand" ? Number(a.brand_id) === req.user.refId : Number(a.influencer_id) === req.user.refId);
  if (!allowed) throw new AppError(404, "Application not found.");
  const [hist] = await pool.execute("SELECT status, changed_at FROM application_history WHERE application_id = ? ORDER BY id", [id]);
  res.json({ ...ser.application(a), history: hist.map((h) => ({ status: h.status, at: Number(h.changed_at) })) });
}));

// Creator pitches for a campaign.
router.post("/", requireRole("influencer"), asyncHandler(async (req, res) => {
  const campaignId = v.idBody(req.body.campaignId, "Campaign");
  const pitch = v.text(req.body.pitch, "Pitch", { min: 15, max: 3000 });
  const now = Date.now();
  let created;
  try {
    created = await withTransaction(async (conn) => {
      const [cRows] = await conn.execute("SELECT * FROM campaigns WHERE id = ?", [campaignId]);
      if (!cRows.length) throw new AppError(404, "Campaign not found.");
      const campaign = cRows[0];
      if (campaign.status !== "open") throw new AppError(409, "This campaign is closed.");

      const [iRows] = await conn.execute("SELECT * FROM influencers WHERE id = ?", [req.user.refId]);
      if (!iRows.length) throw new AppError(404, "Creator profile not found.");
      const inf = iRows[0];

      const score = matchScore(ser.influencer(inf), ser.campaign(campaign));
      const [r] = await conn.execute(
        "INSERT INTO applications (campaign_id, influencer_id, status, pitch, score, created_at) VALUES (?, ?, 'applied', ?, ?, ?)",
        [campaignId, inf.id, pitch, score, now]
      );
      await conn.execute("INSERT INTO application_history (application_id, status, changed_at) VALUES (?, 'applied', ?)", [r.insertId, now]);
      await notifyUsers(conn, await userIdsForBrand(conn, campaign.brand_id), `${inf.handle} applied to “${campaign.title}” with a ${score}% match.`);
      const [aRows] = await conn.execute("SELECT * FROM applications WHERE id = ?", [r.insertId]);
      return aRows[0];
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") throw new AppError(409, "You've already pitched for this one.");
    throw err;
  }
  res.status(201).json(ser.application(created));
}));

// Brand moves an application along: applied → review → accepted → progress → completed (or rejected).
router.put("/:id", requireRole("brand"), asyncHandler(async (req, res) => {
  const id = v.idParam(req.params.id);
  const to = v.oneOf(req.body.status, APP_STATUSES, "Status");
  const updated = await withTransaction(async (conn) => {
    const [rows] = await conn.execute(
      `SELECT a.*, c.brand_id, c.title, c.budget
         FROM applications a JOIN campaigns c ON c.id = a.campaign_id
        WHERE a.id = ? FOR UPDATE`, [id]);
    const a = rows[0];
    if (!a || Number(a.brand_id) !== req.user.refId) throw new AppError(404, "Application not found.");
    if (!TRANSITIONS[a.status].includes(to)) {
      throw new AppError(409, `An application that is "${STAGE_LABEL[a.status]}" can't be moved to "${STAGE_LABEL[to]}".`);
    }
    const now = Date.now();
    await conn.execute("UPDATE applications SET status = ? WHERE id = ?", [to, id]);
    await conn.execute("INSERT INTO application_history (application_id, status, changed_at) VALUES (?, ?, ?)", [id, to, now]);

    const creatorUsers = await userIdsForInfluencer(conn, a.influencer_id);
    await notifyUsers(conn, creatorUsers, `Your application for “${a.title}” is now: ${STAGE_LABEL[to]}.`);
    if (to === "completed") {
      await conn.execute("UPDATE influencers SET completed_count = completed_count + 1 WHERE id = ?", [a.influencer_id]);
      await notifyUsers(conn, creatorUsers, `${money(a.budget)} released for “${a.title}”.`);
    }
    const [out] = await conn.execute("SELECT * FROM applications WHERE id = ?", [id]);
    return out[0];
  });
  res.json(ser.application(updated));
}));

// Creator withdraws a pitch that hasn't been accepted yet.
router.delete("/:id", requireRole("influencer"), asyncHandler(async (req, res) => {
  const id = v.idParam(req.params.id);
  const [rows] = await pool.execute("SELECT * FROM applications WHERE id = ? AND influencer_id = ?", [id, req.user.refId]);
  if (!rows.length) throw new AppError(404, "Application not found.");
  if (!["applied", "review"].includes(rows[0].status)) throw new AppError(409, "Only pending applications can be withdrawn.");
  await pool.execute("DELETE FROM applications WHERE id = ?", [id]);
  res.json({ ok: true });
}));

module.exports = router;
