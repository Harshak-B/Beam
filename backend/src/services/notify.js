// Notification helpers. All take a connection so they can join a transaction.
async function notifyUsers(conn, userIds, text) {
  const now = Date.now();
  for (const uid of userIds) {
    await conn.execute("INSERT INTO notifications (user_id, text, is_read, created_at) VALUES (?, ?, 0, ?)", [uid, text.slice(0, 500), now]);
  }
}
async function userIdsForBrand(conn, brandId) {
  const [rows] = await conn.execute("SELECT id FROM users WHERE brand_id = ?", [brandId]);
  return rows.map((r) => r.id);
}
async function userIdsForInfluencer(conn, influencerId) {
  const [rows] = await conn.execute("SELECT id FROM users WHERE influencer_id = ?", [influencerId]);
  return rows.map((r) => r.id);
}
module.exports = { notifyUsers, userIdsForBrand, userIdsForInfluencer };
