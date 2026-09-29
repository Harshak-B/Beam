const router = require("express").Router();
const { pool } = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");

// Quick check that the API and database are up: GET /api/health
router.get("/health", asyncHandler(async (req, res) => {
  await pool.query("SELECT 1");
  res.json({ status: "ok" });
}));

router.use("/auth", require("./auth"));
router.use(require("./bootstrap"));
router.use("/campaigns", require("./campaigns"));
router.use("/applications", require("./applications"));
router.use("/influencers", require("./influencers"));
router.use("/brands", require("./brands"));
router.use("/notifications", require("./notifications"));

router.use((req, res, next) => next(new AppError(404, "API route not found.")));

module.exports = router;
