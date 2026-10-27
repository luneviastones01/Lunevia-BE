const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const userController = require("../controllers/userController");
const { protect } = require("../middleware/auth");
const { validate } = require("../middleware/validate");

// All user routes require authentication
router.use(protect);

router
  .route("/profile")
  .get(userController.getProfile)
  .patch(
    [
      body("name").optional().trim().isLength({ min: 1, max: 60 }),
      body("phone").optional().matches(/^[\d\s\+\-\(\)]{7,15}$/),
      validate,
    ],
    userController.updateProfile
  );

router.patch(
  "/change-password",
  [
    body("currentPassword").notEmpty().withMessage("Current password required"),
    body("newPassword")
      .isLength({ min: 8 })
      .withMessage("New password must be at least 8 characters")
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage("Must contain uppercase, lowercase, and a number"),
    validate,
  ],
  userController.changePassword
);

router.get("/wishlist", userController.getWishlist);
router.post("/wishlist/:productId", userController.toggleWishlist);

router.delete("/account", userController.deleteAccount);

module.exports = router;
