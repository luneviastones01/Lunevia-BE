const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  productName: { type: String, required: true }, // Snapshot at time of order
  productImage: { type: String, default: "" },
  price: { type: Number, required: true },       // Snapshot
  quantity: { type: Number, required: true, min: 1 },
  subtotal: { type: Number, required: true },
});

const shippingAddressSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email:    { type: String, required: true },
  phone:    { type: String, required: true },
  address:  { type: String, required: true },
  city:     { type: String, required: true },
  state:    { type: String, required: true },
  zip:      { type: String, required: true },
  country:  { type: String, required: true },
});

const orderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      unique: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    items: {
      type: [orderItemSchema],
      validate: [arr => arr.length > 0, "Order must have at least one item"],
    },
    shippingAddress: {
      type: shippingAddressSchema,
      required: true,
    },
    itemsTotal: { type: Number, required: true },
    shippingCost: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    total: { type: Number, required: true },

    status: {
      type: String,
      enum: ["pending", "processing", "shipped", "delivered", "cancelled"],
      default: "pending",
    },
    statusHistory: [
      {
        status: String,
        timestamp: { type: Date, default: Date.now },
        note: String,
      },
    ],

    // Payment
    paymentStatus: {
      type: String,
      enum: ["unpaid", "paid", "refunded", "failed"],
      default: "unpaid",
    },
    paymentMethod: {
      type: String,
      enum: ["razorpay", "cod", "stripe"],
      default: "razorpay",
    },
    razorpayOrderId: String,
    razorpayPaymentId: String,
    razorpaySignature: String,

    // Shipping
    trackingNumber: String,
    estimatedDelivery: Date,

    notes: { type: String, maxlength: 500, default: "" },
  },
  { timestamps: true }
);

// ── Indexes ──────────────────────────────────────────────────
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1 });

// ── Auto-generate readable orderId ───────────────────────────
orderSchema.pre("save", async function (next) {
  if (!this.orderId) {
    const count = await mongoose.model("Order").countDocuments();
    this.orderId = `ORD-${String(count + 1).padStart(4, "0")}`;
  }
  // Track status changes
  if (this.isModified("status")) {
    this.statusHistory.push({ status: this.status });
  }
  next();
});

module.exports = mongoose.model("Order", orderSchema);
