// GET/POST /api/campaigns   GET/PUT/DELETE /api/campaigns/:id   POST /api/campaigns/:id/invites
const router = require("express").Router();
const { pool, withTransaction } = require("../config/db");
const { requireAuth, requireRole } = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const v = require("../utils/validate");
const ser = require("../utils/serializers");
const q = require("../services/queries");
const { matchScore } = require("../utils/matchScore");
const { recalcScores } = require("../services/scores");
const { notifyUsers, userIdsForInfluencer } = require("../services/notify");
const { money } = require("../utils/format");
const { CATEGORIES, PLATFORMS, CITIES } = require("../constants");

router.use(requireAuth);

async function findCampaign(id, db = pool) {
  const [rows] = await db.execute("SELECT * FROM campaigns WHERE id = ?", [id]);
  if (!rows.length) throw new AppError(404, "Campaign not found.");
  return rows[0];
}
function assertOwner(req, campaign) {
  if (req.user.role !== "brand" || Number(campaign.brand_id) !== req.user.refId) {
    throw new AppError(403, "You can only change your own campaigns.");
  }
}

// List — brands: their own; creators: open ones plus ones they applied to.
router.get("/", asyncHandler(async (req, res) => {
  res.json((await q.listCampaigns(req.user)).map(ser.campaign));
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const c = await findCampaign(v.idParam(req.params.id));
  if (req.user.role === "brand") {
    if (Number(c.brand_id) !== req.user.refId) throw new AppError(404, "Campaign not found.");
  } else if (c.status !== "open") {
    const [a] = await pool.execute("SELECT id FROM applications WHERE campaign_id = ? AND influencer_id = ?", [c.id, req.user.refId]);
    if (!a.length) throw new AppError(404, "Campaign not found.");
  }
  res.json(ser.campaign(c));
}));

// Fields a brand can set. Returns column → value pairs (for create, all are required).
function readCampaignFields(body, { partial }) {
  const out = {};
  const has = (k) => !partial || body[k] !== undefined;
  if (has("title")) out.title = v.text(body.title, "Campaign title", { max: 150 });
  if (has("category")) out.category = v.oneOf(body.category, CATEGORIES, "Category");
  if (has("platform")) out.platform = v.oneOf(body.platform, PLATFORMS, "Platform");
  if (has("location")) out.location = v.oneOf(body.location, CITIES, "Location");
  if (has("minFollowers")) out.min_followers = v.int(body.minFollowers ?? 0, "Minimum followers");
  if (has("minEngagement")) out.min_engagement = v.decimal(body.minEngagement ?? 0, "Minimum engagement", { min: 0, max: 100 });
  if (has("budget")) {
    if (!(Number(body.budget) > 0)) throw new AppError(400, "Set a budget above zero — creators filter by it.");
    out.budget = v.int(body.budget, "Budget", { min: 1 });
  }
  if (has("brief")) out.brief = v.optionalText(body.brief, "Brief", 5000) || "No brief added yet.";
  if (has("deliverables")) {
    const d = v.stringArray(body.deliverables ?? [], "Deliverables");
    out.deliverables = JSON.stringify(d.length ? d : ["To be agreed"]);
  }
  if (partial && body.status !== undefined) out.status = v.oneOf(body.status, ["open", "closed"], "Status");
  return out;
}

router.post("/", requireRole("brand"), asyncHandler(async (req, res) => {
  const f = readCampaignFields(req.body, { partial: false });
  const now = Date.now();
  const created = await withTransaction(async (conn) => {
    const [r] = await conn.execute(
      `INSERT INTO campaigns (brand_id, title, category, platform, min_followers, min_engagement, budget, location, brief, deliverables, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
      [req.user.refId, f.title, f.category, f.platform, f.min_followers, f.min_engagement, f.budget, f.location, f.brief, f.deliverables, now]
    );
    const campaign = await findCampaign(r.insertId, conn);

    // Tell every creator who scores 70+ against the new brief.
    const [creators] = await conn.execute(
      `SELECT u.id AS user_id, i.category, i.platforms, i.followers, i.engagement, i.rate
         FROM users u JOIN influencers i ON i.id = u.influencer_id WHERE u.role = 'influencer'`
    );
    const c = ser.campaign(campaign);
    for (const cr of creators) {
      const score = matchScore({ category: cr.category, platforms: cr.platforms, followers: Number(cr.followers), engagement: Number(cr.engagement), rate: Number(cr.rate) }, c);
      if (score >= 70) await notifyUsers(conn, [cr.user_id], `New brief that fits you: “${c.title}” · ${money(c.budget)}.`);
    }
    return campaign;
  });
  res.status(201).json(ser.campaign(created));
}));

// Update fields and/or open/close. Column names come from the whitelist above, never from the client.
router.put("/:id", requireRole("brand"), asyncHandler(async (req, res) => {
  const id = v.idParam(req.params.id);
  const f = readCampaignFields(req.body, { partial: true });
  const cols = Object.keys(f);
  if (!cols.length) throw new AppError(400, "Nothing to update.");
  const updated = await withTransaction(async (conn) => {
    assertOwner(req, await findCampaign(id, conn));
    await conn.execute(`UPDATE campaigns SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`, [...cols.map((c) => f[c]), id]);
    await recalcScores(conn, { campaignId: id });
    return findCampaign(id, conn);
  });
  res.json(ser.campaign(updated));
}));

router.delete("/:id", requireRole("brand"), asyncHandler(async (req, res) => {
  const id = v.idParam(req.params.id);
  assertOwner(req, await findCampaign(id));
  await pool.execute("DELETE FROM campaigns WHERE id = ?", [id]); // applications cascade
  res.json({ ok: true });
}));

// Invite a creator to pitch — sends them a notification.
router.post("/:id/invites", requireRole("brand"), asyncHandler(async (req, res) => {
  const id = v.idParam(req.params.id);
  const influencerId = v.idBody(req.body.influencerId, "Creator");
  const campaign = await findCampaign(id);
  assertOwner(req, campaign);
  if (campaign.status !== "open") throw new AppError(409, "Reopen the campaign before inviting creators.");
  await withTransaction(async (conn) => {
    const [inf] = await conn.execute("SELECT id FROM influencers WHERE id = ?", [influencerId]);
    if (!inf.length) throw new AppError(404, "Creator not found.");
    await notifyUsers(conn, await userIdsForInfluencer(conn, influencerId), `Invited to pitch for “${campaign.title}” — ${money(campaign.budget)}.`);
  });
  res.status(201).json({ ok: true });
}));

module.exports = router;
