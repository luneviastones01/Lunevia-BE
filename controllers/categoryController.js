const Category = require("../models/Category");
const Product = require("../models/Product");
const mongoose = require("mongoose");
const { successResponse, errorResponse } = require("../utils/apiResponse");

const escapeRegex = (str) => String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ────────────────────────────────────────────────────────────
// GET /api/categories
// ────────────────────────────────────────────────────────────
exports.getAllCategories = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return successResponse(res, "Categories fetched.", { categories: [] });
    }
    const categories = await Category.find({ isActive: true }).sort({ name: 1 });
    if (process.env.NODE_ENV === "production") {
      res.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    } else {
      res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    }
    return successResponse(res, "Categories fetched.", { categories });
  } catch {
    return successResponse(res, "Categories fetched.", { categories: [] });
  }
};

// ────────────────────────────────────────────────────────────
// GET /api/categories/:id
// ────────────────────────────────────────────────────────────
exports.getCategory = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return errorResponse(res, "Category not found.", 404);
    }
    const category = await Category.findById(req.params.id);
    if (!category) return errorResponse(res, "Category not found.", 404);
    if (process.env.NODE_ENV === "production") {
      res.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    } else {
      res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    }
    return successResponse(res, "Category fetched.", { category });
  } catch {
    return errorResponse(res, "Category not found.", 404);
  }
};

// ────────────────────────────────────────────────────────────
// POST /api/categories  (admin only)
// ────────────────────────────────────────────────────────────
exports.createCategory = async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) {
      return errorResponse(res, "Category name is required", 400);
    }
    const trimmed = name.trim();
    let category = await Category.findOne({ name: new RegExp(`^${escapeRegex(trimmed)}$`, "i") });
    if (!category) {
      category = await Category.create({ name: trimmed, description: description || "" });
    }
    return successResponse(res, "Category ready.", { category }, 201);
  } catch (err) {
    return errorResponse(res, err.message, 400);
  }
};

// ────────────────────────────────────────────────────────────
// PATCH /api/categories/:id  (admin only)
// ────────────────────────────────────────────────────────────
exports.updateCategory = async (req, res) => {
  try {
    const { name, description, isActive } = req.body;
    const target = req.params.id;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (isActive !== undefined) updates.isActive = isActive;

    // Accept either ObjectId or category name as :id
    let category;
    if (mongoose.Types.ObjectId.isValid(target)) {
      category = await Category.findByIdAndUpdate(target, updates, { new: true, runValidators: true });
    } else {
      category = await Category.findOneAndUpdate(
        { name: new RegExp(`^${escapeRegex(decodeURIComponent(target).trim())}$`, "i") },
        updates,
        { new: true, runValidators: true }
      );
    }
    if (!category) return errorResponse(res, "Category not found.", 404);
    return successResponse(res, "Category updated.", { category });
  } catch (err) {
    return errorResponse(res, err.message, 400);
  }
};

// ────────────────────────────────────────────────────────────
// DELETE /api/categories/:id  (admin only)
// ────────────────────────────────────────────────────────────
exports.deleteCategory = async (req, res) => {
  try {
    const target = req.params.id;
    let category;
    if (mongoose.Types.ObjectId.isValid(target)) {
      category = await Category.findById(target);
    }
    if (!category) {
      category = await Category.findOne({ name: new RegExp(`^${escapeRegex(decodeURIComponent(target).trim())}$`, "i") });
    }
    if (!category) {
      return successResponse(res, "Category not found or already deleted.");
    }

    const productCount = await Product.countDocuments({ category: category._id });
    if (productCount > 0) {
      return errorResponse(
        res,
        `Cannot delete "${category.name}". ${productCount} specimen(s) are linked to it.`,
        400
      );
    }

    await Category.findByIdAndDelete(category._id);
    return successResponse(res, "Category deleted.");
  } catch (err) {
    return errorResponse(res, err.message, 400);
  }
};
