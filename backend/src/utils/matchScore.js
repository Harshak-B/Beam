// Server-side copy of the matching algorithm in frontend/script.js (kept identical).
// Weights: category 30, platform 20, followers 20, engagement 20, budget 10.
const { parseJson } = require("./serializers");

const clamp01 = (x) => Math.max(0, Math.min(1, x));

function matchScore(inf, camp) {
  const platforms = Array.isArray(inf.platforms) ? inf.platforms : parseJson(inf.platforms, []);
  const cat = camp.category === "Any" || inf.category === camp.category ? 30 : 0;
  const plat = platforms.indexOf(camp.platform) > -1 ? 20 : 0;
  const fol = Math.round(clamp01(camp.minFollowers > 0 ? inf.followers / camp.minFollowers : 1) * 20);
  const eng = Math.round(clamp01(camp.minEngagement > 0 ? inf.engagement / camp.minEngagement : 1) * 20);
  const bud = Math.round(clamp01(inf.rate > 0 ? camp.budget / inf.rate : 1) * 10);
  return cat + plat + fol + eng + bud;
}

module.exports = { matchScore };
