const Razorpay = require("razorpay");
const crypto = require("crypto");
const Order = require("../models/Order");
const { successResponse, errorResponse } = require("../utils/apiResponse");
const logger = require("../utils/logger");

// Lazily initialised — prevents crash if keys missing in dev
let razorpayInstance = null;
const getRazorpay = () => {
  if (!razorpayInstance) {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new Error("Razorpay credentials not configured.");
    }
    razorpayInstance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return razorpayInstance;
};

// ────────────────────────────────────────────────────────────
// POST /api/payment/create-order
// Creates a Razorpay order for an existing app order
// ────────────────────────────────────────────────────────────
exports.createRazorpayOrder = async (req, res) => {
  const { orderId } = req.body;

  const order = await Order.findById(orderId);
  if (!order) return errorResponse(res, "Order not found.", 404);
  if (order.user.toString() !== req.user._id.toString()) {
    return errorResponse(res, "Not authorised.", 403);
  }
  if (order.paymentStatus === "paid") {
    return errorResponse(res, "Order is already paid.", 400);
  }

  try {
    const razorpay = getRazorpay();
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(order.total * 100), // paise
      currency: "INR",
      receipt: order.orderId,
      notes: {
        orderId: order._id.toString(),
        userId: req.user._id.toString(),
      },
    });

    // Save Razorpay order ID
    order.razorpayOrderId = razorpayOrder.id;
    await order.save();

    return successResponse(res, "Payment order created.", {
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      key: process.env.RAZORPAY_KEY_ID,
      orderId: order._id,
    });
  } catch (err) {
    logger.error(`Razorpay order creation failed: ${err.message}`);
    return errorResponse(res, "Payment gateway error. Please try again.", 502);
  }
};

// ────────────────────────────────────────────────────────────
// POST /api/payment/verify
// Called by frontend after user completes Razorpay checkout
// ────────────────────────────────────────────────────────────
exports.verifyPayment = async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return errorResponse(res, "Missing payment verification fields.", 400);
  }

  // Verify signature — HMAC SHA256 (timing-safe comparison)
  const body = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");

  const sigBuf = Buffer.from(razorpay_signature, "utf8");
  const expBuf = Buffer.from(expectedSignature, "utf8");

  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    logger.warn(`Invalid Razorpay signature for order ${orderId}`);
    return errorResponse(res, "Payment verification failed. Invalid signature.", 400);
  }

  // Update order
  const order = await Order.findOneAndUpdate(
    { _id: orderId, razorpayOrderId: razorpay_order_id },
    {
      paymentStatus: "paid",
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      status: "processing",
    },
    { new: true }
  );

  if (!order) return errorResponse(res, "Order not found or mismatched.", 404);

  logger.info(`Payment verified: order ${order.orderId}, payment ${razorpay_payment_id}`);
  return successResponse(res, "Payment verified successfully.", {
    order: { _id: order._id, orderId: order.orderId, status: order.status },
  });
};

// ────────────────────────────────────────────────────────────
// POST /api/payment/webhook  — Razorpay webhook handler
// Secure server-to-server payment confirmation
// ────────────────────────────────────────────────────────────
exports.handleWebhook = async (req, res) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) return res.status(200).json({ received: true });

  const signature = req.headers["x-razorpay-signature"];
  const body = JSON.stringify(req.body);

  const expectedSig = crypto
    .createHmac("sha256", webhookSecret)
    .update(body)
    .digest("hex");

  if (signature !== expectedSig) {
    logger.warn("Invalid Razorpay webhook signature");
    return res.status(400).json({ error: "Invalid signature" });
  }

  const { event, payload } = req.body;

  if (event === "payment.captured") {
    const { order_id, id: payment_id } = payload.payment.entity;
    await Order.findOneAndUpdate(
      { razorpayOrderId: order_id },
      { paymentStatus: "paid", razorpayPaymentId: payment_id, status: "processing" }
    );
  }

  if (event === "payment.failed") {
    const { order_id } = payload.payment.entity;
    await Order.findOneAndUpdate(
      { razorpayOrderId: order_id },
      { paymentStatus: "failed" }
    );
  }

  res.status(200).json({ received: true });
};
