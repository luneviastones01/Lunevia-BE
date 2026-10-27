const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const categoryController = require("../controllers/categoryController");
const { adminAuth } = require("../middleware/auth");
const { validate } = require("../middleware/validate");

const categoryRules = [
  body("name").trim().notEmpty().withMessage("Category name required").isLength({ max: 50 }),
  body("description").optional().isLength({ max: 300 }),
];

// Public
router.get("/", categoryController.getAllCategories);
router.get("/:id", categoryController.getCategory);

// Admin only
router.post(
  "/",
  adminAuth,
  categoryRules, validate,
  categoryController.createCategory
);
router.patch(
  "/:id",
  adminAuth,
  validate,
  categoryController.updateCategory
);
router.delete(
  "/:id",
  adminAuth,
  categoryController.deleteCategory
);

module.exports = router;
