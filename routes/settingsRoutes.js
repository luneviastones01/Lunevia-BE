const router = require("express").Router();
const mongoose = require("mongoose");
const Setting = require("../models/Settings");
const { adminAuth } = require("../middleware/auth");
const { uploadProductImage, uploadBufferToCloudinary } = require("../config/cloudinary");

// In-memory fallback cache when MongoDB is offline
const memoryCache = new Map();

// Public: GET /api/settings/:key
router.get("/:key", async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const doc = await Setting.findOne({ key: req.params.key });
      if (doc) return res.json(doc.value);
    }
    return res.json(memoryCache.get(req.params.key) ?? null);
  } catch (err) {
    return res.json(memoryCache.get(req.params.key) ?? null);
  }
});

// Admin: POST /api/settings/upload-image (direct stream upload to Cloudinary)
router.post("/upload-image", adminAuth, uploadProductImage.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No image file provided" });
    }
    const result = await uploadBufferToCloudinary(req.file.buffer, req.file.originalname);
    if (!result || !result.url) {
      return res.status(500).json({ message: "Cloudinary upload failed. Check credentials." });
    }
    return res.json({ url: result.url, publicId: result.publicId });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

// Admin: PUT /api/settings/:key  (replace entire value)
router.put("/:key", adminAuth, async (req, res) => {
  try {
    memoryCache.set(req.params.key, req.body);
    if (mongoose.connection.readyState === 1) {
      const doc = await Setting.findOneAndUpdate(
        { key: req.params.key },
        { value: req.body },
        { upsert: true, new: true, runValidators: true }
      );
      return res.json(doc.value);
    }
    return res.json(req.body);
  } catch (err) {
    return res.json(memoryCache.get(req.params.key) ?? req.body);
  }
});

module.exports = router;
