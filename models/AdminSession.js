const mongoose = require("mongoose");

const adminSessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true },
    tokenHash: { type: String, required: true },
    ip:        { type: String, default: "" },
    userAgent: { type: String, default: "" },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    isActive:  { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AdminSession", adminSessionSchema);
