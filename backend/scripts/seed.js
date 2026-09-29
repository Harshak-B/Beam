// OPTIONAL: loads the sample brands, creators, campaigns and applications that the old
// localStorage version used to generate, but into MySQL as real rows.
//
//   npm run seed              → only runs if the database is empty
//   npm run seed -- --reset   → DELETES all rows first, then re-seeds (use with care)
//
// Demo logins (password for all: demo1234):
//   meera@pixelforge.gg   (brand, Pixel Forge)
//   harshak@beam.co       (creator, @harshak.plays)
const { validateEnv } = require("../src/config/env");
validateEnv();
const bcrypt = require("bcryptjs");
const { pool, withTransaction } = require("../src/config/db");
const { matchScore } = require("../src/utils/matchScore");
const { SWATCH } = require("../src/constants");

const DAY = 86400000;
const DEMO_PASSWORD = "demo1234";

const brands = [
  ["Solstice Skincare", "Skincare", "Mumbai", "dana@solstice.co"],
  ["Northloop Coffee", "Food", "Bengaluru", "ravi@northloop.co"],
  ["Pixel Forge", "Gaming", "Hyderabad", "meera@pixelforge.gg"],
];

const creators = [
  ["@harshak.plays", "Harshak", "Gaming", ["YouTube", "Instagram"], 85000, 6.2, "Chennai", 30000, "Tamil/English gaming reviews, long-form setups and rig builds."],
  ["@lunaskies", "Luna Shah", "Skincare", ["Instagram"], 212000, 6.4, "Mumbai", 60000, "Routines for oily, acne-prone skin. Nothing sponsored that I don't refill."],
  ["@theroastedhour", "Arjun Nair", "Food", ["YouTube", "Instagram"], 88000, 9.1, "Bengaluru", 35000, "Home brewing, cafe crawls, and very strong opinions about milk."],
  ["@fieldnotes.jay", "Jay Menon", "Outdoors", ["YouTube"], 340000, 5.2, "Pune", 90000, "Trail gear tested over 40km before I say a word about it."],
  ["@marnie.makes", "Marnie D'Souza", "Home & DIY", ["Instagram", "YouTube"], 54000, 7.8, "Chennai", 22000, "Rental-friendly makeovers under ₹5,000."],
  ["@code.with.tara", "Tara Iyer", "Tech", ["YouTube", "LinkedIn"], 160000, 4.6, "Bengaluru", 55000, "Dev tooling teardowns and interview prep."],
  ["@liftswithneel", "Neel Kapoor", "Fitness", ["Instagram"], 121000, 5.9, "Delhi", 40000, "Strength programming for people with desk jobs."],
  ["@rupeerani", "Sana Qureshi", "Finance", ["Instagram", "X"], 96000, 7.1, "Mumbai", 45000, "Personal finance in plain Hindi. No 'get rich' nonsense."],
  ["@thriftandthread", "Ishita Bose", "Fashion", ["Instagram"], 47000, 8.4, "Kolkata", 18000, "Thrifted fits, tailoring tricks, slow fashion."],
  ["@onewaytickets", "Vikram Rao", "Travel", ["YouTube", "Instagram"], 265000, 4.1, "Remote", 75000, "Budget itineraries across South and Southeast Asia."],
  ["@frag.nights", "Dev Sharma", "Gaming", ["Instagram", "X"], 46000, 8.9, "Pune", 16000, "Competitive FPS clips and peripheral reviews."],
  ["@glowbyrhea", "Rhea Thomas", "Skincare", ["Instagram", "YouTube"], 64000, 7.4, "Hyderabad", 25000, "Derm-checked routines for Indian summers."],
  ["@buildbytes", "Karan Malhotra", "Tech", ["YouTube"], 410000, 3.8, "Delhi", 120000, "PC builds, benchmarks, and thermals nobody else measures."],
  ["@souppotdiaries", "Aisha Khan", "Food", ["Instagram"], 33000, 10.2, "Hyderabad", 12000, "One-pot recipes for tiny kitchens."],
];
// creator index → login (only two creators have logins)
const creatorLogins = { 0: ["Harshak Reddy", "harshak@beam.co"], 1: ["Luna Shah", "luna@beam.co"] };

// [brand idx, title, category, platform, minFollowers, minEngagement, budget, location, brief, deliverables]
const campaigns = [
  [2, "Gaming laptop launch — Forge X16", "Gaming", "Instagram", 50000, 5, 50000, "Hyderabad", "One reel plus three stories. Show real gameplay on the machine, thermals included. Keep it unscripted.", ["1 reel (45–60s)", "3 stories", "Usage rights 30 days"]],
  [0, "Monsoon barrier serum", "Skincare", "Instagram", 40000, 6, 45000, "Mumbai", "A two-week before/after on humid-weather breakouts. We want honesty over hype.", ["2 posts", "1 reel", "Before/after carousel"]],
  [1, "Single-origin subscription push", "Food", "YouTube", 60000, 5, 60000, "Bengaluru", "A brew-along video using our Feb roast. Your method, your kitchen.", ["1 long-form video", "2 community posts"]],
  [2, "Peripherals restock — Forge Deck", "Gaming", "YouTube", 30000, 7, 25000, "Remote", "Short review of the keyboard, sound test included. Budget is firm.", ["1 video (8–12 min)", "1 short"]],
  [0, "Derm-checked summer routine", "Skincare", "YouTube", 50000, 4, 70000, "Remote", "Long-form routine breakdown with a dermatologist cameo. We cover the consult.", ["1 long-form video", "1 reel cutdown"]],
  [1, "Cafe opening — Indiranagar", "Food", "Instagram", 25000, 7, 20000, "Bengaluru", "Opening week coverage. Come hungry, bring a friend.", ["1 reel", "4 stories"]],
];

// [campaign idx, creator idx, status, pitch]
const applications = [
  [0, 10, "applied", "I run Telugu FPS content and my audience buys mid-range rigs. Happy to do a thermals segment."],
  [0, 0, "review", "I've built three rigs on camera this year. Can deliver in 10 days."],
  [1, 11, "accepted", "Humid-weather skin is literally my whole feed. Two-week test works."],
  [2, 2, "progress", "Brew-along is my format. Shooting this weekend."],
  [4, 1, "completed", "Done — routine video went out with a derm cameo."],
  [5, 13, "rejected", "Small but very local audience, opening week suits me."],
];

(async () => {
  const reset = process.argv.includes("--reset");
  try {
    const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM users");
    if (n > 0 && !reset) {
      console.log(`Database already has ${n} user(s) — nothing seeded. Use "npm run seed -- --reset" to wipe and re-seed.`);
      return;
    }
    const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
    const now = Date.now();

    await withTransaction(async (conn) => {
      if (reset) {
        for (const t of ["notifications", "application_history", "applications", "campaigns", "users", "influencers", "brands"]) {
          await conn.query(`DELETE FROM ${t}`); // fixed table names, no user input
        }
      }
      const brandIds = [];
      for (let i = 0; i < brands.length; i++) {
        const [b] = brands[i];
        const [r] = await conn.execute("INSERT INTO brands (name, industry, location, color, about, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          [b, brands[i][1], brands[i][2], SWATCH[i], `${b} works with creators who actually use the product.`, now]);
        brandIds.push(r.insertId);
        await conn.execute("INSERT INTO users (email, password_hash, name, role, brand_id, created_at) VALUES (?, ?, ?, 'brand', ?, ?)",
          [brands[i][3], hash, `${b} team`, r.insertId, now]);
      }

      const creatorIds = [];
      for (let i = 0; i < creators.length; i++) {
        const c = creators[i];
        const [r] = await conn.execute(
          `INSERT INTO influencers (handle, name, category, platforms, followers, engagement, location, rate, bio, color, completed_count, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [c[0], c[1], c[2], JSON.stringify(c[3]), c[4], c[5], c[6], c[7], c[8], SWATCH[i % SWATCH.length], i === 1 ? 1 : 0, now]);
        creatorIds.push(r.insertId);
        if (creatorLogins[i]) {
          await conn.execute("INSERT INTO users (email, password_hash, name, role, influencer_id, created_at) VALUES (?, ?, ?, 'influencer', ?, ?)",
            [creatorLogins[i][1], hash, creatorLogins[i][0], r.insertId, now]);
        }
      }

      const campaignIds = [];
      for (let i = 0; i < campaigns.length; i++) {
        const c = campaigns[i];
        const [r] = await conn.execute(
          `INSERT INTO campaigns (brand_id, title, category, platform, min_followers, min_engagement, budget, location, brief, deliverables, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
          [brandIds[c[0]], c[1], c[2], c[3], c[4], c[5], c[6], c[7], c[8], JSON.stringify(c[9]), now - (i + 1) * 3 * DAY]);
        campaignIds.push(r.insertId);
      }

      for (let i = 0; i < applications.length; i++) {
        const [ci, ii, status, pitch] = applications[i];
        const camp = campaigns[ci], cr = creators[ii];
        const score = matchScore(
          { category: cr[2], platforms: cr[3], followers: cr[4], engagement: cr[5], rate: cr[7] },
          { category: camp[2], platform: camp[3], minFollowers: camp[4], minEngagement: camp[5], budget: camp[6] });
        const created = now - (i + 1) * DAY;
        const [r] = await conn.execute(
          "INSERT INTO applications (campaign_id, influencer_id, status, pitch, score, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          [campaignIds[ci], creatorIds[ii], status, pitch, score, created]);
        await conn.execute("INSERT INTO application_history (application_id, status, changed_at) VALUES (?, 'applied', ?)", [r.insertId, created]);
        if (status !== "applied") {
          await conn.execute("INSERT INTO application_history (application_id, status, changed_at) VALUES (?, ?, ?)", [r.insertId, status, now - i * 3600000]);
        }
      }
    });
    console.log("✔ Seeded sample data. Demo logins (password: demo1234): meera@pixelforge.gg (brand), harshak@beam.co (creator)");
  } catch (err) {
    console.error("✖ Seeding failed:", err.code || "", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
