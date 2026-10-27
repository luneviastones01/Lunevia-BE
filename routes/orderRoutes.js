const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const orderController = require("../controllers/orderController");
const { protect, restrictTo } = require("../middleware/auth");
const { validate } = require("../middleware/validate");

const shippingAddressRules = [
  body("shippingAddress.fullName").trim().notEmpty().withMessage("Full name required"),
  body("shippingAddress.email").isEmail().normalizeEmail().withMessage("Valid email required"),
  body("shippingAddress.phone").notEmpty().withMessage("Phone required"),
  body("shippingAddress.address").trim().notEmpty().withMessage("Address required"),
  body("shippingAddress.city").trim().notEmpty().withMessage("City required"),
  body("shippingAddress.state").trim().notEmpty().withMessage("State required"),
  body("shippingAddress.zip").trim().notEmpty().withMessage("ZIP required"),
  body("shippingAddress.country").trim().notEmpty().withMessage("Country required"),
  body("items").isArray({ min: 1 }).withMessage("Order must have at least one item"),
  body("items.*.productId").isMongoId().withMessage("Valid product ID required"),
  body("items.*.quantity").isInt({ min: 1 }).withMessage("Quantity must be at least 1"),
];

// All order routes require auth
router.use(protect);

router.post("/", shippingAddressRules, validate, orderController.createOrder);
router.get("/", orderController.getMyOrders);
router.get("/:id", orderController.getOrder);

// Admin
router.get(
  "/admin/all",
  restrictTo("admin"),
  orderController.getAllOrders
);
router.get(
  "/admin/stats",
  restrictTo("admin"),
  orderController.getOrderStats
);
router.patch(
  "/:id/status",
  restrictTo("admin"),
  [
    body("status")
      .isIn(["pending", "processing", "shipped", "delivered", "cancelled"])
      .withMessage("Invalid status"),
    validate,
  ],
  orderController.updateOrderStatus
);

module.exports = router;
