// Allowed values. These mirror the option lists already used by the frontend forms.
const CATEGORIES = ["Gaming", "Skincare", "Food", "Fitness", "Tech", "Fashion", "Travel", "Outdoors", "Finance", "Home & DIY"];
const PLATFORMS = ["Instagram", "YouTube", "X", "LinkedIn"];
const CITIES = ["Hyderabad", "Bengaluru", "Mumbai", "Delhi", "Pune", "Chennai", "Kolkata", "Remote"];
const SWATCH = ["#FFC245", "#FF4F70", "#8CE0C6", "#2C1D3A", "#E63E5C", "#7FB2E5", "#C9A6F2", "#F2A65A"];

const APP_STATUSES = ["applied", "review", "accepted", "progress", "completed", "rejected"];
const STAGE_LABEL = {
  applied: "Applied", review: "Under review", accepted: "Accepted",
  progress: "In progress", completed: "Completed", rejected: "Rejected",
};
// Which status changes a brand may make.
const TRANSITIONS = {
  applied: ["review", "accepted", "rejected"],
  review: ["accepted", "rejected"],
  accepted: ["progress"],
  progress: ["completed"],
  completed: [],
  rejected: [],
};

module.exports = { CATEGORIES, PLATFORMS, CITIES, SWATCH, APP_STATUSES, STAGE_LABEL, TRANSITIONS };
