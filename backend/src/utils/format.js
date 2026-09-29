function money(n) { return "₹" + (Number(n) || 0).toLocaleString("en-IN"); }
module.exports = { money };
