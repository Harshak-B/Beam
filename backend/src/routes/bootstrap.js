// GET /api/bootstrap — everything the frontend needs after login, scoped to the current user.
const router = require("express").Router();
const { requireAuth } = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const q = require("../services/queries");
const ser = require("../utils/serializers");

router.get("/bootstrap", requireAuth, asyncHandler(async (req, res) => {
  const [user, brands, influencers, campaigns, applications, notifications] = await Promise.all([
    q.getUser(req.user.id),
    q.listBrands(),
    q.listInfluencers(req.user),
    q.listCampaigns(req.user),
    q.listApplications(req.user),
    q.listNotifications(req.user.id),
  ]);
  if (!user) throw new AppError(401, "Your account no longer exists.");
  res.json({
    me: ser.me(user),
    brands: brands.map(ser.brand),
    influencers: influencers.map(ser.influencer),
    campaigns: campaigns.map(ser.campaign),
    applications: applications.map(ser.application),
    notifications: notifications.map(ser.notification),
  });
}));

module.exports = router;
