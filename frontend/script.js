(function () {
"use strict";

/* ====================== API + state ====================== */
/* ▶ API_BASE — where the Node/Express backend lives.
   "/api" works when Express serves this frontend too (the default: http://localhost:3000).
   If you host this frontend somewhere else, use the full API URL instead, e.g.
   "http://localhost:3000/api", and add this site's origin to CORS_ORIGIN in backend/.env.
   NOTE: no database details ever go in this file — they live only in backend/.env. */
var API_BASE = "/api";
var TOKEN_KEY = "beam.token";   /* only the login token is kept in the browser; all data lives in MySQL */

function emptyDb() { return { me: null, brands: [], influencers: [], campaigns: [], applications: [], notifications: [] }; }
function emptyUi() { return { view: "overview", campaignId: null, influencerId: null, filters: {}, auth: null }; }
var db = emptyDb();
var ui = emptyUi();

function getToken() { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } }
function setToken(t) { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch (e) {} }
function now() { return Date.now(); }

async function api(method, path, body) {
  var opts = { method: method, headers: {} };
  var token = getToken();
  if (token) opts.headers.Authorization = "Bearer " + token;
  if (body !== undefined) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  var res;
  try { res = await fetch(API_BASE + path, opts); }
  catch (e) { throw new Error("Can't reach the server. Is the backend running?"); }
  var data = null;
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) {
    if (res.status === 401 && token && path.indexOf("/auth/") !== 0) sessionExpired();
    var err = new Error((data && data.error) || "Something went wrong (" + res.status + ").");
    err.status = res.status;
    throw err;
  }
  return data;
}
/* Reload everything this user is allowed to see from MySQL. */
async function refresh() {
  var d = await api("GET", "/bootstrap");
  db = { me: d.me, brands: d.brands, influencers: d.influencers, campaigns: d.campaigns, applications: d.applications, notifications: d.notifications };
}
async function softRefresh() { try { await refresh(); } catch (e) { /* keep showing what we have */ } }
function sessionExpired() {
  setToken(null); db = emptyDb(); ui = emptyUi(); render();
  toast("Your session expired. Please log in again.", "bad");
}
function fail(e) { if (e && e.status === 401) return; toast((e && e.message) || "Something went wrong.", "bad"); }
function busy(form, on) { var b = form && form.querySelector('button[type="submit"]'); if (b) b.disabled = !!on; }

/* ====================== option lists (used by the forms) ====================== */
var CATEGORIES = ["Gaming", "Skincare", "Food", "Fitness", "Tech", "Fashion", "Travel", "Outdoors", "Finance", "Home & DIY"];
var PLATFORMS = ["Instagram", "YouTube", "X", "LinkedIn"];
var CITIES = ["Hyderabad", "Bengaluru", "Mumbai", "Delhi", "Pune", "Chennai", "Kolkata", "Remote"];

/* ====================== matching algorithm ====================== */
/* Weights: category 30, platform 20, followers 20, engagement 20, budget 10 */
function matchScore(inf, camp) {
  if (!inf || !camp) return { total: 0, parts: [] };
  var parts = [];

  var cat = camp.category === "Any" || inf.category === camp.category ? 30 : 0;
  parts.push({ label: "Category fit", got: cat, max: 30, note: cat ? inf.category : inf.category + " vs " + camp.category });

  var plat = inf.platforms.indexOf(camp.platform) > -1 ? 20 : 0;
  parts.push({ label: "Platform", got: plat, max: 20, note: plat ? "Active on " + camp.platform : "Not on " + camp.platform });

  var fRatio = camp.minFollowers > 0 ? inf.followers / camp.minFollowers : 1;
  var fol = Math.round(Math.max(0, Math.min(1, fRatio)) * 20);
  parts.push({ label: "Reach", got: fol, max: 20, note: fmt(inf.followers) + " of " + fmt(camp.minFollowers) + " needed" });

  var eRatio = camp.minEngagement > 0 ? inf.engagement / camp.minEngagement : 1;
  var eng = Math.round(Math.max(0, Math.min(1, eRatio)) * 20);
  parts.push({ label: "Engagement", got: eng, max: 20, note: inf.engagement + "% of " + camp.minEngagement + "% needed" });

  var bRatio = inf.rate > 0 ? camp.budget / inf.rate : 1;
  var bud = Math.round(Math.max(0, Math.min(1, bRatio)) * 10);
  parts.push({ label: "Budget fit", got: bud, max: 10, note: bud === 10 ? "Rate " + money(inf.rate) + " fits budget" : "Asks " + money(inf.rate) + ", budget " + money(camp.budget) });

  var total = parts.reduce(function (s, p) { return s + p.got; }, 0);
  return { total: total, parts: parts };
}

/* ====================== helpers ====================== */
function fmt(n) {
  n = Number(n) || 0;
  if (n >= 1000000) return (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + "K";
  return String(n);
}
function money(n) { return "₹" + (Number(n) || 0).toLocaleString("en-IN"); }
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function ago(ts) {
  var m = Math.floor((now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  var h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}
function byId(arr, id) { for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i]; return null; }
function scoreColor(t) {
  if (t >= 85) return "var(--mint)";
  if (t >= 65) return "var(--gold)";
  if (t >= 40) return "rgba(255,79,112,0.35)";
  return "var(--surface-3)";
}

var STAGES = ["applied", "review", "accepted", "progress", "completed"];
var STAGE_LABEL = { applied: "Applied", review: "Under review", accepted: "Accepted", progress: "In progress", completed: "Completed", rejected: "Rejected" };

function toast(text, kind) {
  var wrap = document.getElementById("toasts");
  var el = document.createElement("div");
  el.className = "toast " + (kind || "");
  el.textContent = text;
  wrap.appendChild(el);
  setTimeout(function () { el.remove(); }, 3600);
}

function me() { return db.me; }
function myBrand() { var u = me(); return u && u.role === "brand" ? byId(db.brands, u.refId) : null; }
function myInf() { var u = me(); return u && u.role === "influencer" ? byId(db.influencers, u.refId) : null; }
function unread() {
  var u = me(); if (!u) return 0;
  return db.notifications.filter(function (n) { return n.userId === u.id && !n.read; }).length;
}

/* ====================== small view pieces ====================== */
function avatarHTML(name, color, size) {
  var s = size || 34;
  return '<span class="avatar" style="background:' + color + ';width:' + s + 'px;height:' + s + 'px;font-size:' + (s / 2.6).toFixed(0) + 'px">' + esc((name || "?").replace("@", "").charAt(0).toUpperCase()) + "</span>";
}
function scoreHTML(total) {
  var dark = total >= 40;
  var fg = dark ? "#1F1329" : "var(--text)";
  var sub = dark ? "rgba(31,19,41,0.6)" : "var(--text-faint)";
  return '<div class="score" style="background:' + scoreColor(total) + ";color:" + fg + '"><span>' + total +
    '</span><small style="color:' + sub + '">match</small></div>';
}
function breakdownHTML(parts) {
  return '<div class="breakdown">' + parts.map(function (p) {
    return "<div><span>" + esc(p.label) + ' <span class="tiny">' + esc(p.note) + '</span></span>' +
      '<span class="bar"><i style="width:' + Math.round((p.got / p.max) * 100) + '%"></i></span>' +
      '<span class="tiny" style="text-align:right">' + p.got + "/" + p.max + "</span></div>";
  }).join("") + "</div>";
}
function timelineHTML(app) {
  if (app.status === "rejected") {
    return '<div class="timeline"><i class="done">Applied</i><i class="dead">Rejected</i></div>';
  }
  var idx = STAGES.indexOf(app.status);
  return '<div class="timeline">' + STAGES.map(function (s, i) {
    var cls = i < idx ? "done" : i === idx ? "now" : "";
    return '<i class="' + cls + '">' + STAGE_LABEL[s] + "</i>";
  }).join("") + "</div>";
}
function statusChip(status) {
  var map = { applied: "chip-plum", review: "chip-gold", accepted: "chip-mint", progress: "chip-gold", completed: "chip-mint", rejected: "chip-coral" };
  return '<span class="chip ' + map[status] + '">' + STAGE_LABEL[status] + "</span>";
}
function selectHTML(id, label, options, value, allLabel) {
  var opts = (allLabel ? '<option value="">' + esc(allLabel) + "</option>" : "") + options.map(function (o) {
    return '<option value="' + esc(o) + '"' + (String(value) === String(o) ? " selected" : "") + ">" + esc(o) + "</option>";
  }).join("");
  return '<label class="field" style="margin:0"><span>' + esc(label) + '</span><select id="' + id + '" data-act="filter">' + opts + "</select></label>";
}

/* ====================== auth ====================== */
function renderAuth() {
  var box = document.getElementById("auth");
  if (!ui.auth) { box.className = "hidden"; box.innerHTML = ""; return; }
  var mode = ui.auth.mode;
  var role = ui.auth.role || "influencer";
  box.className = "auth-wrap";
  box.innerHTML =
    '<div class="auth-card" role="dialog" aria-modal="true">' +
      '<div class="row-between"><h2>' + (mode === "login" ? "Log in" : "Create your account") + '</h2>' +
      '<button class="btn-ghost" data-act="close-auth" aria-label="Close">✕</button></div>' +
      (mode === "signup" ? '<div class="seg" style="margin-bottom:1rem">' +
        '<button data-act="auth-role" data-role="influencer" class="' + (role === "influencer" ? "on" : "") + '">I\'m a creator</button>' +
        '<button data-act="auth-role" data-role="brand" class="' + (role === "brand" ? "on" : "") + '">I\'m a brand</button></div>' : "") +
      '<form id="auth-form">' +
        (mode === "signup" ? '<label class="field"><span>' + (role === "brand" ? "Brand name" : "Your name") + '</span><input type="text" id="a-name" required></label>' : "") +
        '<label class="field"><span>Email</span><input type="email" id="a-email" required autocomplete="username"></label>' +
        '<label class="field"><span>Password</span><input type="password" id="a-pass" required autocomplete="' + (mode === "login" ? "current-password" : "new-password") + '"></label>' +
        '<p class="err" id="a-err"></p>' +
        '<button class="btn btn-coral" style="width:100%" type="submit">' + (mode === "login" ? "Log in" : "Create account") + "</button>" +
      "</form>" +
      '<p class="tiny" style="margin:0.9rem 0 0">' + (mode === "login" ? "New here? " : "Already on Beam? ") +
        '<button class="link-btn" style="font-size:0.78rem" data-act="auth-switch">' + (mode === "login" ? "Create an account" : "Log in") + "</button></p>" +
      '<div class="demo-row"><p class="tiny" style="margin:0.6rem 0 0">Or open a demo account with data already on it:</p>' +
        '<button data-act="demo" data-email="meera@pixelforge.gg"><strong>Pixel Forge</strong> — brand with two live campaigns</button>' +
        '<button data-act="demo" data-email="harshak@beam.co"><strong>@harshak.plays</strong> — gaming creator, Hyderabad</button>' +
      "</div>" +
      '<p class="tiny" style="margin-top:0.8rem">Demo accounts exist once you run <code>npm run seed</code> in /backend.</p>' +
    "</div>";
  var f = box.querySelector("#a-name") || box.querySelector("#a-email");
  if (f) f.focus();
}

/* ====================== shell ====================== */
function navItems() {
  var u = me();
  if (u.role === "brand") {
    return [["overview", "Overview"], ["campaigns", "Campaigns"], ["applications", "Applications"], ["discover", "Find creators"], ["notifications", "Notifications"], ["profile", "Brand profile"]];
  }
  return [["overview", "Overview"], ["board", "Find campaigns"], ["applications", "My applications"], ["notifications", "Notifications"], ["profile", "My profile"]];
}
function render() {
  var app = document.getElementById("app");
  var landing = document.getElementById("landing");
  renderAuth();
  if (!db.me) { landing.className = ""; app.className = "hidden"; app.innerHTML = ""; return; }
  landing.className = "hidden";
  app.className = "app";

  var u = me();
  var who = u.role === "brand" ? myBrand() : myInf();
  var items = navItems();
  var n = unread();

  var links = items.map(function (it) {
    var badge = it[0] === "notifications" && n ? '<span class="dot-badge">' + n + "</span>" : "";
    return '<button class="side-link ' + (ui.view === it[0] ? "active" : "") + '" data-act="nav" data-view="' + it[0] + '">' + it[1] + badge + "</button>";
  }).join("");

  app.innerHTML =
    '<aside class="side">' +
      '<span class="logo">Beam<span class="dot">.</span></span>' + links +
      '<div class="side-foot"><div class="who">' + avatarHTML(who.handle || who.name, who.color, 36) +
        "<div><strong>" + esc(who.handle || who.name) + '</strong><small>' + (u.role === "brand" ? "Brand" : "Creator") + "</small></div></div>" +
        '<div class="spread"><button class="btn-ghost" data-act="theme">Theme</button><button class="btn-ghost" data-act="logout">Log out</button></div>' +
      "</div>" +
    "</aside>" +
    '<div><div class="mobile-bar"><span class="logo">Beam<span class="dot">.</span></span>' +
      '<div class="spread"><button class="btn-ghost" data-act="theme">Theme</button><button class="btn-ghost" data-act="logout">Log out</button></div></div>' +
      '<div class="m-tabs">' + links + "</div>" +
      '<main class="main" id="main"></main></div>';

  document.getElementById("main").innerHTML = viewHTML();
  window.scrollTo({ top: 0, behavior: "auto" });
}
function repaint() {
  var main = document.getElementById("main");
  if (!main) return render();
  var active = document.activeElement;
  var id = active && active.id, ss = active && active.selectionStart;
  main.innerHTML = viewHTML();
  if (id) {
    var el = document.getElementById(id);
    if (el) { el.focus(); try { if (ss != null) el.setSelectionRange(ss, ss); } catch (e) {} }
  }
}
function viewHTML() {
  var u = me();
  switch (ui.view) {
    case "campaign": return campaignDetail();
    case "creator": return creatorDetail();
    case "notifications": return notificationsView();
    case "profile": return u.role === "brand" ? brandProfile() : creatorProfile();
    case "applications": return u.role === "brand" ? brandApplications() : creatorApplications();
    case "campaigns": return brandCampaigns();
    case "discover": return discoverView();
    case "board": return boardView();
    default: return u.role === "brand" ? brandOverview() : creatorOverview();
  }
}
function head(title, sub, right) {
  return '<div class="page-head"><div><h1>' + esc(title) + "</h1>" + (sub ? "<p>" + esc(sub) + "</p>" : "") + "</div>" + (right || "") + "</div>";
}

/* ====================== brand views ====================== */
function brandCampaignList() {
  var b = myBrand();
  return db.campaigns.filter(function (c) { return c.brandId === b.id; });
}
function appsFor(campId) {
  return db.applications.filter(function (a) { return a.campaignId === campId; });
}
function brandOverview() {
  var b = myBrand();
  var camps = brandCampaignList();
  var apps = db.applications.filter(function (a) { return camps.some(function (c) { return c.id === a.campaignId; }); });
  var accepted = apps.filter(function (a) { return ["accepted", "progress", "completed"].indexOf(a.status) > -1; });
  var done = camps.filter(function (c) { return c.status === "closed"; });

  var perf = camps.slice(0, 5).map(function (c) {
    var ca = appsFor(c.id);
    var pct = ca.length ? Math.round(ca.reduce(function (s, a) { return s + a.score; }, 0) / ca.length) : 0;
    return '<div style="margin-bottom:0.9rem"><div class="row-between" style="margin-bottom:0.3rem"><span style="font-size:0.88rem;font-weight:600">' + esc(c.title) + '</span><span class="tiny">' + ca.length + " applicant" + (ca.length === 1 ? "" : "s") + " · avg " + pct + '%</span></div><span class="bar gold"><i style="width:' + pct + '%"></i></span></div>';
  }).join("") || '<p class="muted">No campaigns yet.</p>';

  return head("Hi, " + b.name, "Here's what the board looks like for you today.",
      '<button class="btn btn-coral" data-act="nav" data-view="campaigns">New campaign</button>') +
    '<div class="stat-grid">' +
      '<div class="stat"><b>' + camps.filter(function (c) { return c.status === "open"; }).length + "</b><span>Open campaigns</span></div>" +
      '<div class="stat"><b>' + apps.length + "</b><span>Applications</span></div>" +
      '<div class="stat accent"><b>' + accepted.length + "</b><span>Creators booked</span></div>" +
      '<div class="stat"><b>' + done.length + "</b><span>Closed campaigns</span></div>" +
    "</div>" +
    '<div class="grid-2">' +
      '<div class="card"><h3 style="font-size:1.1rem">Applicant quality by campaign</h3><p class="tiny" style="margin-bottom:1rem">Average match score of everyone who applied.</p>' + perf + "</div>" +
      '<div class="card"><h3 style="font-size:1.1rem">Needs your call</h3>' + pendingList(apps) + "</div>" +
    "</div>";
}
function pendingList(apps) {
  var pend = apps.filter(function (a) { return a.status === "applied" || a.status === "review"; })
    .sort(function (x, y) { return y.score - x.score; }).slice(0, 5);
  if (!pend.length) return '<p class="muted">Nothing waiting. Every application has an answer.</p>';
  return '<div class="list">' + pend.map(function (a) {
    var inf = byId(db.influencers, a.influencerId);
    var c = byId(db.campaigns, a.campaignId);
    return '<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:0.7rem">' +
      '<div class="row" style="gap:0.6rem">' + avatarHTML(inf.handle, inf.color, 32) +
      "<div><strong style=\"font-size:0.9rem\">" + esc(inf.handle) + '</strong><div class="tiny">' + esc(c.title) + "</div></div></div>" +
      '<div class="row" style="gap:0.5rem"><span class="chip chip-gold">' + a.score + '%</span><button class="btn btn-outline btn-sm" data-act="open-campaign" data-id="' + c.id + '">Review</button></div></div>';
  }).join("") + "</div>";
}

function brandCampaigns() {
  var camps = brandCampaignList();
  var f = ui.filters;
  var form =
    '<div class="card" style="margin-bottom:1.6rem"><h3 style="font-size:1.15rem">Post a campaign</h3>' +
    '<p class="tiny" style="margin-bottom:1rem">Beam scores every creator against these numbers, so be honest about the budget.</p>' +
    '<form id="camp-form"><div class="form-grid">' +
      '<label class="field"><span>Campaign title</span><input type="text" id="c-title" required placeholder="Gaming laptop launch"></label>' +
      '<label class="field"><span>Category</span><select id="c-cat">' + CATEGORIES.map(function (c) { return '<option>' + c + "</option>"; }).join("") + "</select></label>" +
      '<label class="field"><span>Platform</span><select id="c-plat">' + PLATFORMS.map(function (p) { return "<option>" + p + "</option>"; }).join("") + "</select></label>" +
      '<label class="field"><span>Location</span><select id="c-loc">' + CITIES.map(function (c) { return "<option>" + c + "</option>"; }).join("") + "</select></label>" +
      '<label class="field"><span>Minimum followers</span><input type="number" id="c-fol" min="0" step="1000" value="50000" required></label>' +
      '<label class="field"><span>Minimum engagement (%)</span><input type="number" id="c-eng" min="0" max="100" step="0.1" value="5" required></label>' +
      '<label class="field"><span>Budget (₹)</span><input type="number" id="c-bud" min="0" step="1000" value="50000" required></label>' +
      '<label class="field"><span>Deliverables (comma separated)</span><input type="text" id="c-del" placeholder="1 reel, 3 stories"></label>' +
    "</div>" +
    '<label class="field"><span>Brief</span><textarea id="c-brief" placeholder="What should the creator actually make?"></textarea></label>' +
    '<p class="err" id="c-err"></p><button class="btn btn-coral" type="submit">Post campaign</button></form></div>';

  var list = camps.length ? camps.map(function (c) {
    var ca = appsFor(c.id);
    var pending = ca.filter(function (a) { return a.status === "applied" || a.status === "review"; }).length;
    return '<div class="card"><div class="row-between">' +
      "<div><h3 style=\"font-size:1.15rem;margin-bottom:0.2rem\">" + esc(c.title) + "</h3>" +
      '<div class="spread" style="margin:0.5rem 0"><span class="chip chip-coral">' + esc(c.category) + '</span><span class="chip">' + esc(c.platform) + '</span><span class="chip">' + fmt(c.minFollowers) + '+ followers</span><span class="chip">' + c.minEngagement + '%+ eng.</span><span class="chip chip-gold">' + money(c.budget) + "</span></div>" +
      '<p class="muted" style="margin:0">' + ca.length + " applicant" + (ca.length === 1 ? "" : "s") + (pending ? " · " + pending + " waiting on you" : "") + " · posted " + ago(c.createdAt) + "</p></div>" +
      '<div class="spread"><span class="chip ' + (c.status === "open" ? "chip-mint" : "chip-plum") + '">' + (c.status === "open" ? "Open" : "Closed") + "</span>" +
      '<button class="btn btn-outline btn-sm" data-act="open-campaign" data-id="' + c.id + '">Open board</button></div></div></div>';
  }).join("") : '<div class="empty"><h3>No campaigns yet</h3><p class="muted">Post one above and Beam will rank every creator on the board against it within a second.</p></div>';

  return head("Campaigns", "Every brief you've posted, and who's waiting on an answer.") + form + '<div class="list">' + list + "</div>";
}

function campaignDetail() {
  var c = byId(db.campaigns, ui.campaignId);
  if (!c) return '<div class="empty"><h3>Campaign not found</h3></div>';
  var brand = byId(db.brands, c.brandId);
  var u = me();
  var isOwner = u.role === "brand" && u.refId === c.brandId;

  var facts = '<div class="spread" style="margin-bottom:1rem">' +
    '<span class="chip chip-coral">' + esc(c.category) + '</span><span class="chip">' + esc(c.platform) + '</span>' +
    '<span class="chip">' + fmt(c.minFollowers) + '+ followers</span><span class="chip">' + c.minEngagement + '%+ engagement</span>' +
    '<span class="chip chip-gold">' + money(c.budget) + '</span><span class="chip">' + esc(c.location) + "</span></div>";
  var brief = '<div class="card" style="margin-bottom:1.4rem"><div class="row" style="gap:0.7rem;margin-bottom:0.8rem">' + avatarHTML(brand.name, brand.color, 40) +
    "<div><strong>" + esc(brand.name) + '</strong><div class="tiny">' + esc(brand.industry) + " · " + esc(brand.location) + "</div></div></div>" +
    facts + "<p>" + esc(c.brief) + "</p>" +
    '<p class="tiny" style="margin:0">Deliverables: ' + c.deliverables.map(esc).join(" · ") + "</p></div>";

  var back = '<button class="btn btn-outline btn-sm" data-act="nav" data-view="' + (isOwner ? "campaigns" : "board") + '">← Back</button>';

  if (!isOwner) {
    var inf = myInf();
    var m = matchScore(inf, c);
    var mine = db.applications.filter(function (a) { return a.campaignId === c.id && a.influencerId === inf.id; })[0];
    var applyBox = mine
      ? '<div class="card"><h3 style="font-size:1.1rem">Your application</h3>' + statusChip(mine.status) + timelineHTML(mine) + '<p class="muted" style="margin-top:0.8rem">' + esc(mine.pitch) + "</p></div>"
      : '<div class="card"><h3 style="font-size:1.1rem">Pitch for this</h3>' +
        '<form id="apply-form"><label class="field"><span>Why you, in a couple of lines</span><textarea id="p-pitch" placeholder="What you\'d make, and why your audience is the right one."></textarea></label>' +
        '<p class="err" id="p-err"></p><button class="btn btn-coral" type="submit">Send application</button></form></div>';
    return head(c.title, "Posted by " + brand.name + " · " + ago(c.createdAt), back) + brief +
      '<div class="grid-2"><div class="card"><div class="row" style="gap:1rem">' + scoreHTML(m.total) +
      '<div><h3 style="font-size:1.05rem;margin:0">How you score on this brief</h3><p class="tiny" style="margin:0">Same maths the brand sees.</p></div></div>' +
      breakdownHTML(m.parts) + "</div>" + applyBox + "</div>";
  }

  /* brand side: ranked matches + applications */
  var applied = appsFor(c.id);
  var appliedIds = applied.map(function (a) { return a.influencerId; });
  var ranked = db.influencers.map(function (i) { return { inf: i, m: matchScore(i, c) }; })
    .sort(function (a, b) { return b.m.total - a.m.total; }).slice(0, 8);

  var appsHTML = applied.length ? applied.sort(function (a, b) { return b.score - a.score; }).map(function (a) {
    var inf = byId(db.influencers, a.influencerId);
    var m = matchScore(inf, c);
    return '<div class="card"><div class="row-between"><div class="row" style="gap:0.8rem">' + scoreHTML(a.score) +
      "<div><strong>" + esc(inf.handle) + '</strong><div class="tiny">' + esc(inf.name) + " · " + fmt(inf.followers) + " followers · " + inf.engagement + "% · " + esc(inf.location) + "</div>" +
      '<div style="margin-top:0.4rem">' + statusChip(a.status) + "</div></div></div>" +
      '<div class="spread">' + actionsFor(a) + '<button class="btn-ghost" data-act="open-creator" data-id="' + inf.id + '">Profile</button></div></div>' +
      '<p class="muted" style="margin:0.9rem 0 0">' + esc(a.pitch || "No pitch attached.") + "</p>" + timelineHTML(a) +
      '<details style="margin-top:0.6rem"><summary class="tiny" style="cursor:pointer">Score breakdown</summary>' + breakdownHTML(m.parts) + "</details></div>";
  }).join("") : '<div class="empty"><h3>No applications yet</h3><p class="muted">Invite someone from the ranked list — creators get a notification the moment you do.</p></div>';

  var rankHTML = ranked.map(function (r) {
    var has = appliedIds.indexOf(r.inf.id) > -1;
    return '<div class="card"><div class="row-between"><div class="row" style="gap:0.8rem">' + scoreHTML(r.m.total) +
      "<div><strong>" + esc(r.inf.handle) + '</strong><div class="tiny">' + esc(r.inf.category) + " · " + fmt(r.inf.followers) + " · " + r.inf.engagement + "% · asks " + money(r.inf.rate) + "</div></div></div>" +
      '<div class="spread">' + (has ? '<span class="chip chip-mint">Applied</span>' : '<button class="btn btn-outline btn-sm" data-act="invite" data-inf="' + r.inf.id + '" data-camp="' + c.id + '">Invite</button>') +
      '<button class="btn-ghost" data-act="open-creator" data-id="' + r.inf.id + '">Profile</button></div></div>' +
      '<details style="margin-top:0.6rem"><summary class="tiny" style="cursor:pointer">Why this score</summary>' + breakdownHTML(r.m.parts) + "</details></div>";
  }).join("");

  return head(c.title, "Your brief, your applicants, and the creators Beam would pick.", back +
      '<button class="btn btn-outline btn-sm" data-act="toggle-campaign" data-id="' + c.id + '">' + (c.status === "open" ? "Close campaign" : "Reopen") + "</button>" +
      '<button class="btn btn-outline btn-sm" data-act="delete-campaign" data-id="' + c.id + '">Delete</button>') +
    brief +
    '<h2 style="font-size:1.3rem;margin-top:2rem">Applications (' + applied.length + ")</h2>" +
    '<div class="list" style="margin-bottom:2.4rem">' + appsHTML + "</div>" +
    '<h2 style="font-size:1.3rem">Best matches on the board</h2><p class="muted">Ranked out of 100: category 30, platform 20, reach 20, engagement 20, budget 10.</p>' +
    '<div class="list">' + rankHTML + "</div>";
}

function actionsFor(a) {
  var b = "";
  if (a.status === "applied") b += '<button class="btn btn-outline btn-sm" data-act="set-status" data-id="' + a.id + '" data-to="review">Move to review</button>';
  if (a.status === "applied" || a.status === "review") {
    b += '<button class="btn btn-coral btn-sm" data-act="set-status" data-id="' + a.id + '" data-to="accepted">Accept</button>';
    b += '<button class="btn-ghost" data-act="set-status" data-id="' + a.id + '" data-to="rejected">Reject</button>';
  }
  if (a.status === "accepted") b += '<button class="btn btn-coral btn-sm" data-act="set-status" data-id="' + a.id + '" data-to="progress">Start work</button>';
  if (a.status === "progress") b += '<button class="btn btn-coral btn-sm" data-act="set-status" data-id="' + a.id + '" data-to="completed">Mark completed &amp; pay</button>';
  return b;
}

function brandApplications() {
  var camps = brandCampaignList();
  var f = ui.filters;
  var apps = db.applications.filter(function (a) { return camps.some(function (c) { return c.id === a.campaignId; }); });
  if (f.status) apps = apps.filter(function (a) { return a.status === f.status; });
  if (f.camp) apps = apps.filter(function (a) { return a.campaignId === f.camp; });
  apps.sort(function (x, y) { return y.score - x.score; });

  var filters = '<div class="filters">' +
    '<label class="field" style="margin:0"><span>Campaign</span><select id="f-camp" data-act="filter"><option value="">All campaigns</option>' +
      camps.map(function (c) { return '<option value="' + c.id + '"' + (f.camp === c.id ? " selected" : "") + ">" + esc(c.title) + "</option>"; }).join("") + "</select></label>" +
    '<label class="field" style="margin:0"><span>Status</span><select id="f-status" data-act="filter"><option value="">Any status</option>' +
      STAGES.concat(["rejected"]).map(function (s) { return '<option value="' + s + '"' + (f.status === s ? " selected" : "") + ">" + STAGE_LABEL[s] + "</option>"; }).join("") + "</select></label>" +
    "</div>";

  if (!apps.length) return head("Applications", "Everyone who pitched, across every campaign.") + filters + '<div class="empty"><h3>Nothing here</h3><p class="muted">No applications match this filter yet.</p></div>';

  var rows = apps.map(function (a) {
    var inf = byId(db.influencers, a.influencerId);
    var c = byId(db.campaigns, a.campaignId);
    return "<tr><td><strong>" + esc(inf.handle) + '</strong><div class="tiny">' + fmt(inf.followers) + " · " + inf.engagement + "%</div></td>" +
      "<td>" + esc(c.title) + "</td><td>" + a.score + "%</td><td>" + statusChip(a.status) + "</td>" +
      '<td class="spread">' + actionsFor(a) + '<button class="btn-ghost" data-act="open-campaign" data-id="' + c.id + '">Board</button></td></tr>';
  }).join("");

  return head("Applications", "Everyone who pitched, across every campaign.") + filters +
    '<div class="card tablewrap"><table><thead><tr><th>Creator</th><th>Campaign</th><th>Match</th><th>Status</th><th>Actions</th></tr></thead><tbody>' + rows + "</tbody></table></div>";
}

function discoverView() {
  var f = ui.filters;
  var camps = brandCampaignList();
  var against = f.against ? byId(db.campaigns, f.against) : null;
  var list = db.influencers.slice();

  if (f.q) list = list.filter(function (i) { return (i.handle + " " + i.name + " " + i.bio).toLowerCase().indexOf(f.q.toLowerCase()) > -1; });
  if (f.cat) list = list.filter(function (i) { return i.category === f.cat; });
  if (f.plat) list = list.filter(function (i) { return i.platforms.indexOf(f.plat) > -1; });
  if (f.loc) list = list.filter(function (i) { return i.location === f.loc; });
  if (f.minFol) list = list.filter(function (i) { return i.followers >= Number(f.minFol); });
  if (f.minEng) list = list.filter(function (i) { return i.engagement >= Number(f.minEng); });
  if (f.maxRate) list = list.filter(function (i) { return i.rate <= Number(f.maxRate); });

  if (against) {
    list = list.map(function (i) { return { inf: i, m: matchScore(i, against) }; }).sort(function (a, b) { return b.m.total - a.m.total; });
  } else {
    list = list.sort(function (a, b) { return b.followers - a.followers; }).map(function (i) { return { inf: i, m: null }; });
  }

  var filters = '<div class="filters">' +
    '<label class="field" style="margin:0"><span>Search</span><input type="text" id="f-q" data-act="filter" value="' + esc(f.q || "") + '" placeholder="handle, name, niche"></label>' +
    selectHTML("f-cat", "Category", CATEGORIES, f.cat, "Any category") +
    selectHTML("f-plat", "Platform", PLATFORMS, f.plat, "Any platform") +
    selectHTML("f-loc", "Location", CITIES, f.loc, "Anywhere") +
    '<label class="field" style="margin:0"><span>Min followers</span><input type="number" id="f-minFol" data-act="filter" step="5000" min="0" value="' + esc(f.minFol || "") + '"></label>' +
    '<label class="field" style="margin:0"><span>Min engagement %</span><input type="number" id="f-minEng" data-act="filter" step="0.5" min="0" value="' + esc(f.minEng || "") + '"></label>' +
    '<label class="field" style="margin:0"><span>Max rate ₹</span><input type="number" id="f-maxRate" data-act="filter" step="5000" min="0" value="' + esc(f.maxRate || "") + '"></label>' +
    '<label class="field" style="margin:0"><span>Score against</span><select id="f-against" data-act="filter"><option value="">No campaign</option>' +
      camps.map(function (c) { return '<option value="' + c.id + '"' + (f.against === c.id ? " selected" : "") + ">" + esc(c.title) + "</option>"; }).join("") + "</select></label>" +
    "</div>";

  var cards = list.length ? list.map(function (r) {
    var i = r.inf;
    return '<div class="card"><div class="row-between"><div class="row" style="gap:0.8rem">' +
      (r.m ? scoreHTML(r.m.total) : avatarHTML(i.handle, i.color, 46)) +
      "<div><strong>" + esc(i.handle) + '</strong><div class="tiny">' + esc(i.name) + " · " + esc(i.category) + " · " + esc(i.location) + "</div>" +
      '<div class="spread" style="margin-top:0.4rem"><span class="chip">' + fmt(i.followers) + ' followers</span><span class="chip chip-mint">' + i.engagement + '%</span><span class="chip chip-gold">asks ' + money(i.rate) + "</span></div></div></div>" +
      '<div class="spread"><button class="btn btn-outline btn-sm" data-act="open-creator" data-id="' + i.id + '">View profile</button></div></div>' +
      '<p class="muted" style="margin:0.8rem 0 0">' + esc(i.bio) + "</p>" +
      (r.m ? '<details style="margin-top:0.6rem"><summary class="tiny" style="cursor:pointer">Score breakdown</summary>' + breakdownHTML(r.m.parts) + "</details>" : "") + "</div>";
  }).join("") : '<div class="empty"><h3>Nobody fits those numbers</h3><p class="muted">Loosen the follower floor or the rate ceiling and try again.</p></div>';

  return head("Find creators", "Filter the roster, or pick a campaign to rank everyone against it.") + filters +
    '<p class="muted">' + list.length + " creator" + (list.length === 1 ? "" : "s") + (against ? " ranked against " + against.title : "") + "</p>" +
    '<div class="list">' + cards + "</div>";
}

function creatorDetail() {
  var i = byId(db.influencers, ui.influencerId);
  if (!i) return '<div class="empty"><h3>Creator not found</h3></div>';
  var camps = brandCampaignList();
  var rows = camps.map(function (c) {
    var m = matchScore(i, c);
    return '<div style="margin-bottom:1rem"><div class="row-between" style="margin-bottom:0.3rem"><span style="font-size:0.9rem;font-weight:600">' + esc(c.title) + '</span><span class="tiny">' + m.total + '%</span></div><span class="bar"><i style="width:' + m.total + '%"></i></span></div>';
  }).join("") || '<p class="muted">Post a campaign to see how this creator scores.</p>';

  var past = db.applications.filter(function (a) { return a.influencerId === i.id; });

  return head(i.handle, i.name + " · " + i.category, '<button class="btn btn-outline btn-sm" data-act="nav" data-view="discover">← Back</button>') +
    '<div class="grid-2"><div class="card"><div class="row" style="gap:0.8rem;margin-bottom:1rem">' + avatarHTML(i.handle, i.color, 52) +
    "<div><strong>" + esc(i.name) + '</strong><div class="tiny">' + esc(i.location) + " · " + i.platforms.join(", ") + "</div></div></div>" +
    "<p>" + esc(i.bio) + "</p>" +
    '<div class="stat-grid" style="margin:0"><div class="stat"><b>' + fmt(i.followers) + "</b><span>Followers</span></div>" +
    '<div class="stat"><b>' + i.engagement + "%</b><span>Engagement</span></div>" +
    '<div class="stat accent"><b>' + money(i.rate) + "</b><span>Expected rate</span></div>" +
    '<div class="stat"><b>' + past.filter(function (a) { return a.status === "completed"; }).length + "</b><span>Completed collabs</span></div></div></div>" +
    '<div class="card"><h3 style="font-size:1.1rem">Fit against your campaigns</h3>' + rows + "</div></div>";
}

function brandProfile() {
  var b = myBrand(), u = me();
  return head("Brand profile", "This is what creators see when they open one of your briefs.") +
    '<div class="card" style="max-width:640px"><form id="brand-form"><div class="form-grid">' +
    '<label class="field"><span>Brand name</span><input type="text" id="b-name" value="' + esc(b.name) + '" disabled></label>' +
    '<label class="field"><span>Industry</span><select id="b-industry">' + CATEGORIES.map(function (c) { return '<option' + (b.industry === c ? " selected" : "") + ">" + c + "</option>"; }).join("") + "</select></label>" +
    '<label class="field"><span>Location</span><select id="b-loc">' + CITIES.map(function (c) { return '<option' + (b.location === c ? " selected" : "") + ">" + c + "</option>"; }).join("") + "</select></label>" +
    '<label class="field"><span>Contact email</span><input type="email" id="b-email" value="' + esc(u.email) + '" required></label>' +
    "</div><label class=\"field\"><span>About</span><textarea id=\"b-about\">" + esc(b.about || "") + "</textarea></label>" +
    '<button class="btn btn-coral" type="submit">Save changes</button></form></div>';
}

/* ====================== creator views ====================== */
function myApps() {
  var i = myInf();
  return db.applications.filter(function (a) { return a.influencerId === i.id; });
}
function creatorOverview() {
  var i = myInf();
  var apps = myApps();
  var open = db.campaigns.filter(function (c) { return c.status === "open"; });
  var scored = open.map(function (c) { return { c: c, m: matchScore(i, c) }; }).sort(function (a, b) { return b.m.total - a.m.total; });
  var avg = apps.length ? Math.round(apps.reduce(function (s, a) { return s + a.score; }, 0) / apps.length) : 0;
  var earned = apps.filter(function (a) { return a.status === "completed"; })
    .reduce(function (s, a) { return s + (byId(db.campaigns, a.campaignId) || { budget: 0 }).budget; }, 0);

  var top = scored.slice(0, 3).map(function (r) {
    var brand = byId(db.brands, r.c.brandId);
    return '<div class="row-between" style="border-bottom:1px solid var(--line);padding:0.6rem 0"><div class="row" style="gap:0.7rem">' + scoreHTML(r.m.total) +
      "<div><strong style=\"font-size:0.92rem\">" + esc(r.c.title) + '</strong><div class="tiny">' + esc(brand.name) + " · " + money(r.c.budget) + "</div></div></div>" +
      '<button class="btn btn-outline btn-sm" data-act="open-campaign" data-id="' + r.c.id + '">Open</button></div>';
  }).join("") || '<p class="muted">No open campaigns right now.</p>';

  return head("Hi, " + i.name.split(" ")[0], "Your board, ranked by how well each brief actually fits you.") +
    '<div class="stat-grid">' +
      '<div class="stat"><b>' + apps.length + "</b><span>Applications</span></div>" +
      '<div class="stat"><b>' + apps.filter(function (a) { return ["accepted", "progress", "completed"].indexOf(a.status) > -1; }).length + "</b><span>Accepted</span></div>" +
      '<div class="stat accent"><b>' + avg + "%</b><span>Average match</span></div>" +
      '<div class="stat"><b>' + money(earned) + "</b><span>Earned on Beam</span></div>" +
    "</div>" +
    '<div class="grid-2"><div class="card"><h3 style="font-size:1.1rem">Best briefs for you today</h3>' + top +
    '<button class="btn btn-coral btn-sm" style="margin-top:1rem" data-act="nav" data-view="board">See the whole board</button></div>' +
    '<div class="card"><h3 style="font-size:1.1rem">Where your pitches stand</h3>' +
      (apps.length ? apps.slice(0, 4).map(function (a) {
        var c = byId(db.campaigns, a.campaignId);
        return '<div style="border-bottom:1px solid var(--line);padding:0.6rem 0"><div class="row-between"><strong style="font-size:0.9rem">' + esc(c.title) + "</strong>" + statusChip(a.status) + "</div>" + timelineHTML(a) + "</div>";
      }).join("") : '<p class="muted">Nothing pitched yet. Open the board and find a brief worth your time.</p>') + "</div></div>";
}

function boardView() {
  var i = myInf(), f = ui.filters;
  var list = db.campaigns.filter(function (c) { return c.status === "open"; });
  if (f.q) list = list.filter(function (c) { return (c.title + " " + c.brief).toLowerCase().indexOf(f.q.toLowerCase()) > -1; });
  if (f.cat) list = list.filter(function (c) { return c.category === f.cat; });
  if (f.plat) list = list.filter(function (c) { return c.platform === f.plat; });
  if (f.minBud) list = list.filter(function (c) { return c.budget >= Number(f.minBud); });
  var scored = list.map(function (c) { return { c: c, m: matchScore(i, c) }; });
  if (f.fitOnly) scored = scored.filter(function (r) { return r.m.total >= 75; });
  scored.sort(function (a, b) { return f.sort === "budget" ? b.c.budget - a.c.budget : b.m.total - a.m.total; });

  var filters = '<div class="filters">' +
    '<label class="field" style="margin:0"><span>Search</span><input type="text" id="f-q" data-act="filter" value="' + esc(f.q || "") + '" placeholder="title or brief"></label>' +
    selectHTML("f-cat", "Category", CATEGORIES, f.cat, "Any category") +
    selectHTML("f-plat", "Platform", PLATFORMS, f.plat, "Any platform") +
    '<label class="field" style="margin:0"><span>Min budget ₹</span><input type="number" id="f-minBud" data-act="filter" step="5000" min="0" value="' + esc(f.minBud || "") + '"></label>' +
    '<label class="field" style="margin:0"><span>Sort by</span><select id="f-sort" data-act="filter"><option value="match"' + (f.sort !== "budget" ? " selected" : "") + '>Match score</option><option value="budget"' + (f.sort === "budget" ? " selected" : "") + ">Budget</option></select></label>" +
    '<label class="field" style="margin:0"><span>Strong fits only</span><select id="f-fitOnly" data-act="filter"><option value="">Show everything</option><option value="1"' + (f.fitOnly ? " selected" : "") + ">75% and above</option></select></label>" +
    "</div>";

  var cards = scored.length ? scored.map(function (r) {
    var brand = byId(db.brands, r.c.brandId);
    var mine = db.applications.filter(function (a) { return a.campaignId === r.c.id && a.influencerId === i.id; })[0];
    return '<div class="card"><div class="row-between"><div class="row" style="gap:0.9rem">' + scoreHTML(r.m.total) +
      "<div><strong>" + esc(r.c.title) + '</strong><div class="tiny">' + esc(brand.name) + " · " + esc(r.c.location) + " · posted " + ago(r.c.createdAt) + "</div>" +
      '<div class="spread" style="margin-top:0.45rem"><span class="chip chip-coral">' + esc(r.c.category) + '</span><span class="chip">' + esc(r.c.platform) + '</span><span class="chip chip-gold">' + money(r.c.budget) + '</span><span class="chip">' + fmt(r.c.minFollowers) + "+ followers</span></div></div></div>" +
      '<div class="spread">' + (mine ? statusChip(mine.status) : "") +
      '<button class="btn btn-coral btn-sm" data-act="open-campaign" data-id="' + r.c.id + '">' + (mine ? "View" : "Read brief") + "</button></div></div>" +
      '<p class="muted" style="margin:0.8rem 0 0">' + esc(r.c.brief) + "</p></div>";
  }).join("") : '<div class="empty"><h3>Nothing matches yet</h3><p class="muted">Clear a filter, or widen the budget floor — new briefs land most days.</p></div>';

  return head("Find campaigns", "Every open brief, scored against your profile.") + filters + '<div class="list">' + cards + "</div>";
}

function creatorApplications() {
  var apps = myApps().sort(function (a, b) { return b.createdAt - a.createdAt; });
  if (!apps.length) return head("My applications", "Every pitch and where it stands.") +
    '<div class="empty"><h3>No pitches yet</h3><p class="muted">Open the board, pick a brief above 70%, and send a short pitch.</p><button class="btn btn-coral" style="margin-top:1rem" data-act="nav" data-view="board">Find campaigns</button></div>';
  return head("My applications", "Every pitch and where it stands.") + '<div class="list">' + apps.map(function (a) {
    var c = byId(db.campaigns, a.campaignId);
    var brand = byId(db.brands, c.brandId);
    return '<div class="card"><div class="row-between"><div class="row" style="gap:0.9rem">' + scoreHTML(a.score) +
      "<div><strong>" + esc(c.title) + '</strong><div class="tiny">' + esc(brand.name) + " · " + money(c.budget) + " · sent " + ago(a.createdAt) + "</div></div></div>" +
      '<div class="spread">' + statusChip(a.status) +
      (["applied", "review"].indexOf(a.status) > -1 ? '<button class="btn-ghost" data-act="withdraw" data-id="' + a.id + '">Withdraw</button>' : "") +
      '<button class="btn btn-outline btn-sm" data-act="open-campaign" data-id="' + c.id + '">Brief</button></div></div>' +
      timelineHTML(a) + '<p class="muted" style="margin:0.8rem 0 0">' + esc(a.pitch || "") + "</p></div>";
  }).join("") + "</div>";
}

function creatorProfile() {
  var i = myInf(), u = me();
  var checks = PLATFORMS.map(function (p) {
    return '<label class="row" style="gap:0.45rem;font-size:0.9rem"><input type="checkbox" id="p-' + p + '" ' + (i.platforms.indexOf(p) > -1 ? "checked" : "") + " style=\"width:auto\"> " + p + "</label>";
  }).join("");
  return head("My profile", "Brands score you on these numbers, so keep them current.") +
    '<div class="card" style="max-width:700px"><form id="inf-form"><div class="form-grid">' +
    '<label class="field"><span>Handle</span><input type="text" id="i-handle" value="' + esc(i.handle) + '" disabled></label>' +
    '<label class="field"><span>Name</span><input type="text" id="i-name" value="' + esc(i.name) + '" disabled></label>' +
    '<label class="field"><span>Category</span><select id="i-cat">' + CATEGORIES.map(function (c) { return "<option" + (i.category === c ? " selected" : "") + ">" + c + "</option>"; }).join("") + "</select></label>" +
    '<label class="field"><span>Location</span><select id="i-loc">' + CITIES.map(function (c) { return "<option" + (i.location === c ? " selected" : "") + ">" + c + "</option>"; }).join("") + "</select></label>" +
    '<label class="field"><span>Followers</span><input type="number" id="i-fol" min="0" step="1000" value="' + i.followers + '" required></label>' +
    '<label class="field"><span>Engagement rate (%)</span><input type="number" id="i-eng" min="0" max="100" step="0.1" value="' + i.engagement + '" required></label>' +
    '<label class="field"><span>Expected rate per campaign (₹)</span><input type="number" id="i-rate" min="0" step="1000" value="' + i.rate + '" required></label>' +
    '<label class="field"><span>Email</span><input type="email" id="i-email" value="' + esc(u.email) + '" required></label>' +
    "</div>" +
    '<div class="field"><span>Platforms</span><div class="spread">' + checks + "</div></div>" +
    '<label class="field"><span>Bio</span><textarea id="i-bio">' + esc(i.bio || "") + "</textarea></label>" +
    '<p class="err" id="i-err"></p><button class="btn btn-coral" type="submit">Save profile</button></form></div>';
}

/* ====================== notifications ====================== */
function notificationsView() {
  var u = me();
  var list = db.notifications.filter(function (n) { return n.userId === u.id; });
  var body = list.length ? '<div class="list">' + list.map(function (n) {
    return '<div class="card" style="' + (n.read ? "opacity:0.65" : "") + '"><div class="row-between"><span>' + esc(n.text) + '</span><span class="tiny">' + ago(n.at) + "</span></div></div>";
  }).join("") + "</div>" : '<div class="empty"><h3>Nothing yet</h3><p class="muted">Status changes and new applications land here.</p></div>';
  return head("Notifications", "Everything that moved since you were last here.",
    list.length ? '<button class="btn btn-outline btn-sm" data-act="read-all">Mark all as read</button>' : "") + body;
}

/* ====================== actions ====================== */
async function setView(v) { ui.view = v; ui.filters = {}; await softRefresh(); render(); }

async function openCampaign(id) { ui.campaignId = id; ui.view = "campaign"; await softRefresh(); render(); }
function openCreator(id) { ui.influencerId = id; ui.view = "creator"; render(); }

async function setStatus(appId, to) {
  var a = byId(db.applications, appId);
  if (!a) return;
  try {
    await api("PUT", "/applications/" + encodeURIComponent(appId), { status: to });
    await refresh();
    var inf = byId(db.influencers, a.influencerId);
    toast((inf ? inf.handle : "Creator") + " → " + STAGE_LABEL[to], to === "rejected" ? "bad" : "good");
    repaint();
  } catch (e) { fail(e); }
}

async function apply(campId, pitch) {
  try {
    var created = await api("POST", "/applications", { campaignId: campId, pitch: pitch });
    await refresh();
    toast("Application sent — " + created.score + "% match.", "good");
    repaint();
  } catch (e) { fail(e); }
}

async function withdraw(appId) {
  try {
    await api("DELETE", "/applications/" + encodeURIComponent(appId));
    await refresh();
    toast("Application withdrawn.");
    repaint();
  } catch (e) { fail(e); }
}

async function invite(infId, campId) {
  try {
    await api("POST", "/campaigns/" + encodeURIComponent(campId) + "/invites", { influencerId: infId });
    var inf = byId(db.influencers, infId);
    toast("Invite sent to " + (inf ? inf.handle : "creator") + ".", "good");
  } catch (e) { fail(e); }
}

async function toggleCampaign(id) {
  var c = byId(db.campaigns, id);
  if (!c) return;
  var next = c.status === "open" ? "closed" : "open";
  try {
    await api("PUT", "/campaigns/" + encodeURIComponent(id), { status: next });
    await refresh();
    toast("Campaign " + (next === "open" ? "reopened." : "closed."), "good");
    repaint();
  } catch (e) { fail(e); }
}

async function deleteCampaign(id) {
  if (!window.confirm("Delete this campaign and all of its applications? This can't be undone.")) return;
  try {
    await api("DELETE", "/campaigns/" + encodeURIComponent(id));
    await refresh();
    toast("Campaign deleted.", "good");
    await setView("campaigns");
  } catch (e) { fail(e); }
}

async function readAllNotifications() {
  try { await api("PUT", "/notifications/read-all"); await refresh(); render(); }
  catch (e) { fail(e); }
}

function logout() { setToken(null); db = emptyDb(); ui = emptyUi(); render(); }

function toggleTheme() {
  var r = document.documentElement;
  var cur = r.getAttribute("data-theme");
  var next = cur === "dark" ? "light" : cur === "light" ? "dark" : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "light" : "dark");
  r.setAttribute("data-theme", next);
  try { localStorage.setItem("beam.theme", next); } catch (e) {}
}

/* ====================== auth ====================== */
async function doLogin(email, pass, errEl) {
  try {
    var r = await api("POST", "/auth/login", { email: email, password: pass });
    setToken(r.token);
    await refresh();
    ui = emptyUi();
    render();
    var u = db.me;
    var who = u.role === "brand" ? byId(db.brands, u.refId) : byId(db.influencers, u.refId);
    toast("Welcome back, " + (who ? (who.handle || who.name) : u.name) + ".", "good");
  } catch (e) {
    if (!db.me) setToken(null);
    errEl.textContent = e.message;
  }
}
async function doSignup(name, email, pass, role, errEl) {
  try {
    var r = await api("POST", "/auth/signup", { name: name, email: email, password: pass, role: role });
    setToken(r.token);
    await refresh();
    ui = emptyUi();
    ui.view = role === "brand" ? "campaigns" : "profile";
    render();
    toast(role === "brand" ? "Account created. Post a campaign to get ranked matches." : "Account created. Complete your profile to get scored.", "good");
  } catch (e) {
    if (!db.me) setToken(null);
    errEl.textContent = e.message;
  }
}

/* ====================== event wiring ====================== */
function actOf(e) {
  var el = e.target.closest ? e.target.closest("[data-act]") : null;
  return el;
}
document.addEventListener("click", function (e) {
  var el = actOf(e);
  if (!el) return;
  var act = el.getAttribute("data-act");
  switch (act) {
    case "nav": setView(el.getAttribute("data-view")); break;
    case "open-campaign": openCampaign(el.getAttribute("data-id")); break;
    case "open-creator": openCreator(el.getAttribute("data-id")); break;
    case "set-status": setStatus(el.getAttribute("data-id"), el.getAttribute("data-to")); break;
    case "withdraw": withdraw(el.getAttribute("data-id")); break;
    case "invite": invite(el.getAttribute("data-inf"), el.getAttribute("data-camp")); break;
    case "toggle-campaign": toggleCampaign(el.getAttribute("data-id")); break;
    case "delete-campaign": deleteCampaign(el.getAttribute("data-id")); break;
    case "logout": logout(); break;
    case "theme": toggleTheme(); break;
    case "read-all": readAllNotifications(); break;
    case "close-auth": ui.auth = null; renderAuth(); break;
    case "auth-role": ui.auth.role = el.getAttribute("data-role"); renderAuth(); break;
    case "auth-switch": ui.auth.mode = ui.auth.mode === "login" ? "signup" : "login"; renderAuth(); break;
    case "demo":
      var em = el.getAttribute("data-email");
      var errBox = document.getElementById("a-err") || document.createElement("p");
      doLogin(em, "demo1234", errBox);
      break;
  }
});

/* landing auth buttons */
document.getElementById("landing").addEventListener("click", function (e) {
  var el = e.target.closest("[data-auth]");
  if (!el) return;
  var v = el.getAttribute("data-auth");
  ui.auth = { mode: v === "login" ? "login" : "signup", role: v === "signup-brand" ? "brand" : "influencer" };
  renderAuth();
});

/* filters */
function readFilters() {
  ["f-q", "f-cat", "f-plat", "f-loc", "f-minFol", "f-minEng", "f-maxRate", "f-against", "f-minBud", "f-sort", "f-fitOnly", "f-camp", "f-status"].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    var key = id.slice(2);
    ui.filters[key] = el.value;
  });
}
document.addEventListener("input", function (e) {
  if (e.target.getAttribute && e.target.getAttribute("data-act") === "filter") { readFilters(); repaint(); }
});
document.addEventListener("change", function (e) {
  if (e.target.getAttribute && e.target.getAttribute("data-act") === "filter") { readFilters(); repaint(); }
});

/* forms */
document.addEventListener("submit", async function (e) {
  var form = e.target;
  if (["auth-form", "camp-form", "apply-form", "inf-form", "brand-form"].indexOf(form.id) === -1) return;
  e.preventDefault();
  var val = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ""; };

  /* ---- log in / sign up ---- */
  if (form.id === "auth-form") {
    var err = document.getElementById("a-err");
    err.textContent = "";
    var email = val("a-email");
    var pass = document.getElementById("a-pass").value;   /* not trimmed: spaces may be part of the password */

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = "That email doesn't look right."; return; }

    if (ui.auth.mode === "login") {
      busy(form, true); await doLogin(email, pass, err); busy(form, false);
    } else {
      var nm = val("a-name");
      if (!nm) { err.textContent = "Please enter your name."; return; }
      if (!/^[A-Za-z ]+$/.test(nm)) { err.textContent = "Name can contain letters and spaces only."; return; }
      if (nm.replace(/ /g, "").length < 2) { err.textContent = "Name must contain at least 2 letters."; return; }
      busy(form, true); await doSignup(nm, email, pass, ui.auth.role, err); busy(form, false);
    }
    return;
  }

  /* ---- post a campaign (brand) ---- */
  if (form.id === "camp-form") {
    var e2 = document.getElementById("c-err"); e2.textContent = "";
    var title = val("c-title");
    var budget = Number(val("c-bud"));
    if (!title) { e2.textContent = "Give the campaign a title creators will recognise."; return; }
    if (!(budget > 0)) { e2.textContent = "Set a budget above zero — creators filter by it."; return; }
    var dels = val("c-del").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    busy(form, true);
    try {
      var c = await api("POST", "/campaigns", {
        title: title, category: val("c-cat"), platform: val("c-plat"), location: val("c-loc"),
        minFollowers: Number(val("c-fol")) || 0, minEngagement: Number(val("c-eng")) || 0, budget: budget,
        brief: val("c-brief"), deliverables: dels
      });
      await refresh();
      toast("Campaign posted. Matches are ranked already.", "good");
      await openCampaign(c.id);
    } catch (ex) { e2.textContent = ex.message; busy(form, false); }
    return;
  }

  /* ---- pitch for a campaign (creator) ---- */
  if (form.id === "apply-form") {
    var pe = document.getElementById("p-err"); pe.textContent = "";
    var pitch = val("p-pitch");
    if (pitch.length < 15) { pe.textContent = "Write at least a line or two — brands skip empty pitches."; return; }
    busy(form, true); await apply(ui.campaignId, pitch); busy(form, false);
    return;
  }

  /* ---- creator profile ---- */
  if (form.id === "inf-form") {
    var ie = document.getElementById("i-err"); ie.textContent = "";
    var plats = PLATFORMS.filter(function (p) { var el = document.getElementById("p-" + p); return el && el.checked; });
    if (!plats.length) { ie.textContent = "Pick at least one platform you actually post on."; return; }
    var handle = val("i-handle");
    var name = val("i-name");
    if (!name) { ie.textContent = "Please enter your name."; return; }
    if (!/^[A-Za-z ]+$/.test(name)) { ie.textContent = "Name can contain letters and spaces only."; return; }
    if (name.replace(/ /g, "").length < 2) { ie.textContent = "Name must contain at least 2 letters."; return; }

    busy(form, true);
    try {
      await api("PUT", "/influencers/me", {
        handle: handle.charAt(0) === "@" ? handle : "@" + handle, name: name,
        category: val("i-cat"), location: val("i-loc"),
        followers: Number(val("i-fol")) || 0, engagement: Number(val("i-eng")) || 0, rate: Number(val("i-rate")) || 0,
        platforms: plats, bio: val("i-bio"), email: val("i-email")
      });
      await refresh();
      toast("Profile saved. Your scores were recalculated.", "good");
      render();
    } catch (ex) { ie.textContent = ex.message; busy(form, false); }
    return;
  }

  /* ---- brand profile ---- */
  if (form.id === "brand-form") {
    var brandName = val("b-name");
    if (!brandName) { alert("Please enter your brand name."); return; }
    if (!/^[A-Za-z ]+$/.test(brandName)) { alert("Brand name can contain letters and spaces only."); return; }
    if (brandName.replace(/ /g, "").length < 2) { alert("Brand name must contain at least 2 letters."); return; }
    busy(form, true);
    try {
      await api("PUT", "/brands/me", {
        name: brandName, industry: val("b-industry"), location: val("b-loc"), about: val("b-about"), email: val("b-email")
      });
      await refresh();
      toast("Brand profile saved.", "good");
      render();
    } catch (ex) { fail(ex); busy(form, false); }
  }
});

document.addEventListener("keydown", function (e) {
  if (e.key === "Escape" && ui.auth) { ui.auth = null; renderAuth(); }
});

/* ====================== boot ====================== */
(async function boot() {
  try {
    var t = localStorage.getItem("beam.theme");
    if (t) document.documentElement.setAttribute("data-theme", t);
  } catch (e) {}

  /* If a login token is saved, load this user's data from the API; otherwise show the landing page. */
  if (getToken()) {
    try { await refresh(); }
    catch (e) { setToken(null); db = emptyDb(); }
  }
  render();
})();
})();
