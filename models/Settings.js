const mongoose = require("mongoose");

// Single-document key-value store for site settings
const settingSchema = new mongoose.Schema({
  key:   { type: String, unique: true, required: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
}, { timestamps: true });

module.exports = mongoose.model("Setting", settingSchema);
