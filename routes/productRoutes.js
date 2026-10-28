const express = require("express");
const router = express.Router();
const { body, param } = require("express-validator");
const productController = require("../controllers/productController");
const { adminAuth } = require("../middleware/auth");
const { uploadProductImage } = require("../config/cloudinary");
const { uploadLimiter } = require("../middleware/rateLimiter");
const { validate } = require("../middleware/validate");

const productRules = [
  body("name").trim().notEmpty().withMessage("Product name required").isLength({ max: 100 }),
  body("price").optional().isFloat({ min: 0 }).withMessage("Price must be a positive number"),
  body("category").trim().notEmpty().withMessage("Category required"),
  body("stock").optional().isInt({ min: 0 }).withMessage("Stock must be a non-negative integer"),
];

// ── Public routes ─────────────────────────────────────────────
router.get("/", productController.getAllProducts);
router.get("/:id", productController.getProduct);

// ── Admin routes ──────────────────────────────────────────────
router.use(adminAuth);

router.post(
  "/",
  uploadLimiter,
  uploadProductImage.array("images", 12),
  productRules,
  validate,
  productController.createProduct
);

router.patch(
  "/:id",
  uploadLimiter,
  uploadProductImage.array("images", 12),
  validate,
  productController.updateProduct
);

router.delete("/:id", productController.deleteProduct);

router.delete(
  "/:id/images/:publicId",
  [param("id").isMongoId(), validate],
  productController.deleteProductImage
);

module.exports = router;
