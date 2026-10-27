const User = require("../models/User");
const Product = require("../models/Product");
const { successResponse, errorResponse } = require("../utils/apiResponse");
const logger = require("../utils/logger");

// ── Sanitize user output ──────────────────────────────────────
const sanitizeUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  avatar: user.avatar,
  wishlist: user.wishlist,
  createdAt: user.createdAt,
});

// ────────────────────────────────────────────────────────────
// GET /api/users/profile
// ────────────────────────────────────────────────────────────
exports.getProfile = async (req, res) => {
  const user = await User.findById(req.user._id).populate("wishlist", "name price images slug");
  return successResponse(res, "Profile fetched.", { user: sanitizeUser(user) });
};

// ────────────────────────────────────────────────────────────
// PATCH /api/users/profile
// ────────────────────────────────────────────────────────────
exports.updateProfile = async (req, res) => {
  const allowedFields = ["name", "phone"];
  const updates = {};
  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });

  if (req.file) updates.avatar = req.file.path; // Cloudinary URL

  const user = await User.findByIdAndUpdate(req.user._id, updates, {
    new: true,
    runValidators: true,
  });

  return successResponse(res, "Profile updated.", { user: sanitizeUser(user) });
};

// ────────────────────────────────────────────────────────────
// PATCH /api/users/change-password
// ────────────────────────────────────────────────────────────
exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select("+password");

  if (!user.password) {
    return errorResponse(res, "Password change not available for OAuth accounts.", 400);
  }

  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) return errorResponse(res, "Current password is incorrect.", 401);

  user.password = newPassword;
  await user.save();

  return successResponse(res, "Password changed successfully.");
};

// ────────────────────────────────────────────────────────────
// GET /api/users/wishlist
// ────────────────────────────────────────────────────────────
exports.getWishlist = async (req, res) => {
  const user = await User.findById(req.user._id).populate({
    path: "wishlist",
    select: "name price images slug category featured",
    populate: { path: "category", select: "name slug" },
  });
  return successResponse(res, "Wishlist fetched.", { wishlist: user.wishlist });
};

// ────────────────────────────────────────────────────────────
// POST /api/users/wishlist/:productId
// ────────────────────────────────────────────────────────────
exports.toggleWishlist = async (req, res) => {
  const { productId } = req.params;

  const product = await Product.findById(productId);
  if (!product) return errorResponse(res, "Product not found.", 404);

  const user = await User.findById(req.user._id);
  const isInWishlist = user.wishlist.includes(productId);

  if (isInWishlist) {
    user.wishlist.pull(productId);
    await user.save();
    return successResponse(res, "Removed from wishlist.", { inWishlist: false });
  } else {
    user.wishlist.addToSet(productId);
    await user.save();
    return successResponse(res, "Added to wishlist.", { inWishlist: true });
  }
};

// ────────────────────────────────────────────────────────────
// DELETE /api/users/account  (soft delete)
// ────────────────────────────────────────────────────────────
exports.deleteAccount = async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { active: false });
  return successResponse(res, "Account deactivated successfully.");
};

// ── ADMIN ONLY ────────────────────────────────────────────────

// GET /api/admin/users
exports.getAllUsers = async (req, res) => {
  const users = await User.find().select("-__v").sort({ createdAt: -1 });
  return successResponse(res, "Users fetched.", { count: users.length, users });
};

// PATCH /api/admin/users/:id/role
exports.updateUserRole = async (req, res) => {
  const { role } = req.body;
  if (!["user", "admin"].includes(role)) {
    return errorResponse(res, "Invalid role. Must be 'user' or 'admin'.", 400);
  }
  if (req.params.id === req.user._id.toString()) {
    return errorResponse(res, "You cannot change your own role.", 400);
  }
  const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
  if (!user) return errorResponse(res, "User not found.", 404);
  return successResponse(res, "User role updated.", { user: sanitizeUser(user) });
};

// DELETE /api/admin/users/:id
exports.deleteUser = async (req, res) => {
  if (req.params.id === req.user._id.toString()) {
    return errorResponse(res, "You cannot delete your own account via admin panel.", 400);
  }
  const user = await User.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
  if (!user) return errorResponse(res, "User not found.", 404);
  return successResponse(res, "User deactivated.");
};
