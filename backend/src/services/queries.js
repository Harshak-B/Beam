// Read queries shared by /api/bootstrap and the list endpoints.
// Every query is parameterized (?) — user input is never concatenated into SQL.
// Each list is scoped to what the logged-in user is allowed to see.
const { pool } = require("../config/db");

async function listBrands() {
  const [rows] = await pool.execute("SELECT * FROM brands ORDER BY id");
  return rows;
}

// Brands see every creator (that's the "find creators" feature). Creators only see themselves.
async function listInfluencers(user) {
  if (user.role === "brand") {
    const [rows] = await pool.execute("SELECT * FROM influencers ORDER BY id");
    return rows;
  }
  const [rows] = await pool.execute("SELECT * FROM influencers WHERE id = ?", [user.refId]);
  return rows;
}

// Brands see their own campaigns. Creators see open campaigns plus any they've applied to.
async function listCampaigns(user) {
  if (user.role === "brand") {
    const [rows] = await pool.execute("SELECT * FROM campaigns WHERE brand_id = ? ORDER BY created_at DESC, id DESC", [user.refId]);
    return rows;
  }
  const [rows] = await pool.execute(
    `SELECT * FROM campaigns
      WHERE status = 'open' OR id IN (SELECT campaign_id FROM applications WHERE influencer_id = ?)
      ORDER BY created_at DESC, id DESC`,
    [user.refId]
  );
  return rows;
}

// Brands see applications to their campaigns. Creators see their own.
async function listApplications(user) {
  if (user.role === "brand") {
    const [rows] = await pool.execute(
      `SELECT a.* FROM applications a
         JOIN campaigns c ON c.id = a.campaign_id
        WHERE c.brand_id = ?
        ORDER BY a.created_at DESC, a.id DESC`,
      [user.refId]
    );
    return rows;
  }
  const [rows] = await pool.execute("SELECT * FROM applications WHERE influencer_id = ? ORDER BY created_at DESC, id DESC", [user.refId]);
  return rows;
}

async function listNotifications(userId) {
  const [rows] = await pool.execute("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC", [userId]);
  return rows;
}

async function getUser(id) {
  const [rows] = await pool.execute("SELECT * FROM users WHERE id = ?", [id]);
  return rows[0] || null;
}

module.exports = { listBrands, listInfluencers, listCampaigns, listApplications, listNotifications, getUser };
