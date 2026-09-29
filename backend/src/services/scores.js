// Re-computes stored application scores after a campaign or a creator profile changes.
const { matchScore } = require("../utils/matchScore");

async function recalcScores(conn, { campaignId, influencerId }) {
  const [rows] = await conn.execute(
    `SELECT a.id, a.score,
            c.category AS c_category, c.platform AS c_platform, c.min_followers AS c_min_followers,
            c.min_engagement AS c_min_engagement, c.budget AS c_budget,
            i.category AS i_category, i.platforms AS i_platforms, i.followers AS i_followers,
            i.engagement AS i_engagement, i.rate AS i_rate
       FROM applications a
       JOIN campaigns c   ON c.id = a.campaign_id
       JOIN influencers i ON i.id = a.influencer_id
      WHERE ${campaignId ? "a.campaign_id = ?" : "a.influencer_id = ?"}`,
    [campaignId || influencerId]
  );
  for (const r of rows) {
    const score = matchScore(
      { category: r.i_category, platforms: r.i_platforms, followers: Number(r.i_followers), engagement: Number(r.i_engagement), rate: Number(r.i_rate) },
      { category: r.c_category, platform: r.c_platform, minFollowers: Number(r.c_min_followers), minEngagement: Number(r.c_min_engagement), budget: Number(r.c_budget) }
    );
    if (score !== Number(r.score)) await conn.execute("UPDATE applications SET score = ? WHERE id = ?", [score, r.id]);
  }
}
module.exports = { recalcScores };
