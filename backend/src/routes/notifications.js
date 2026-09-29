// GET /api/notifications   PUT /api/notifications/read-all   PUT /api/notifications/:id/read
const router = require("express").Router();
const { pool } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const v = require("../utils/validate");
const ser = require("../utils/serializers");
const q = require("../services/queries");

router.use(requireAuth);

router.get("/", asyncHandler(async (req, res) => {
  res.json((await q.listNotifications(req.user.id)).map(ser.notification));
}));

router.put("/read-all", asyncHandler(async (req, res) => {
  await pool.execute("UPDATE notifications SET is_read = 1 WHERE user_id = ?", [req.user.id]);
  res.json({ ok: true });
}));

router.put("/:id/read", asyncHandler(async (req, res) => {
  const [r] = await pool.execute("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?", [v.idParam(req.params.id), req.user.id]);
  if (!r.affectedRows) throw new AppError(404, "Notification not found.");
  res.json({ ok: true });
}));

module.exports = router;
