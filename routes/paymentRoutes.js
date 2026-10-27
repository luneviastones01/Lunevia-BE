const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const paymentController = require("../controllers/paymentController");
const { protect } = require("../middleware/auth");
const { validate } = require("../middleware/validate");

// Webhook: raw body needed for signature verification
// Mount BEFORE express.json() parses the body — handled in server.js
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  paymentController.handleWebhook
);

// Authenticated payment routes
router.post(
  "/create-order",
  protect,
  [body("orderId").isMongoId().withMessage("Valid order ID required"), validate],
  paymentController.createRazorpayOrder
);

router.post(
  "/verify",
  protect,
  [
    body("razorpay_order_id").notEmpty(),
    body("razorpay_payment_id").notEmpty(),
    body("razorpay_signature").notEmpty(),
    body("orderId").isMongoId(),
    validate,
  ],
  paymentController.verifyPayment
);

module.exports = router;
