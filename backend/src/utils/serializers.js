// Turns database rows (snake_case) into the JSON shape the frontend already uses (camelCase).
// All ids are sent as strings, because the frontend compares ids read from HTML attributes.
const s = (v) => (v == null ? null : String(v));

function parseJson(v, fallback) {
  if (v == null) return fallback;
  if (typeof v === "string") { try { return JSON.parse(v); } catch (_) { return fallback; } } // MariaDB returns JSON as text
  return v;
}

const brand = (r) => ({ id: s(r.id), name: r.name, industry: r.industry, location: r.location, color: r.color, about: r.about || "" });

const influencer = (r) => ({
  id: s(r.id), handle: r.handle, name: r.name, category: r.category,
  platforms: parseJson(r.platforms, []), followers: Number(r.followers), engagement: Number(r.engagement),
  location: r.location, rate: Number(r.rate), bio: r.bio || "", color: r.color, completed: Number(r.completed_count),
});

const campaign = (r) => ({
  id: s(r.id), brandId: s(r.brand_id), title: r.title, category: r.category, platform: r.platform,
  minFollowers: Number(r.min_followers), minEngagement: Number(r.min_engagement), budget: Number(r.budget),
  location: r.location, brief: r.brief, deliverables: parseJson(r.deliverables, []), status: r.status,
  createdAt: Number(r.created_at),
});

const application = (r) => ({
  id: s(r.id), campaignId: s(r.campaign_id), influencerId: s(r.influencer_id), status: r.status,
  pitch: r.pitch, score: Number(r.score), createdAt: Number(r.created_at),
});

const notification = (r) => ({ id: s(r.id), userId: s(r.user_id), text: r.text, read: !!r.is_read, at: Number(r.created_at) });

// The logged-in user. Never includes the password hash.
const me = (r) => ({ id: s(r.id), name: r.name, email: r.email, role: r.role, refId: s(r.role === "brand" ? r.brand_id : r.influencer_id) });

module.exports = { brand, influencer, campaign, application, notification, me, parseJson };
