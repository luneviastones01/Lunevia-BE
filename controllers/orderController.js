const Order = require("../models/Order");
const Product = require("../models/Product");
const { successResponse, errorResponse, paginatedResponse } = require("../utils/apiResponse");
const { getPagination, buildPaginationMeta } = require("../utils/paginate");
const logger = require("../utils/logger");

// ────────────────────────────────────────────────────────────
// POST /api/orders  — Create order from cart
// ────────────────────────────────────────────────────────────
exports.createOrder = async (req, res) => {
  const { items, shippingAddress, paymentMethod = "razorpay", notes } = req.body;

  if (!items || items.length === 0) {
    return errorResponse(res, "Order must contain at least one item.", 400);
  }

  // Validate products and build order items
  const orderItems = [];
  let itemsTotal = 0;

  for (const item of items) {
    const product = await Product.findById(item.productId);
    if (!product || !product.isActive) {
      return errorResponse(res, `Product "${item.productId}" not found or unavailable.`, 400);
    }
    if (product.stock < item.quantity) {
      return errorResponse(
        res,
        `Insufficient stock for "${product.name}". Available: ${product.stock}`,
        400
      );
    }

    const subtotal = product.price * item.quantity;
    itemsTotal += subtotal;

    orderItems.push({
      product: product._id,
      productName: product.name,
      productImage: product.images[0]?.url || "",
      price: product.price,
      quantity: item.quantity,
      subtotal,
    });
  }

  // Shipping & tax (configurable in future)
  const shippingCost = itemsTotal >= 999 ? 0 : 99; // Free shipping above ₹999
  const tax = Math.round(itemsTotal * 0.18 * 100) / 100; // 18% GST
  const total = itemsTotal + shippingCost + tax;

  const order = await Order.create({
    user: req.user._id,
    items: orderItems,
    shippingAddress,
    itemsTotal,
    shippingCost,
    tax,
    total,
    paymentMethod,
    notes,
    statusHistory: [{ status: "pending" }],
  });

  // Decrement stock (reserve inventory)
  const stockUpdates = orderItems.map((item) =>
    Product.findByIdAndUpdate(item.product, {
      $inc: { stock: -item.quantity, soldCount: item.quantity },
    })
  );
  await Promise.all(stockUpdates);

  return successResponse(res, "Order created successfully.", { order }, 201);
};

// ────────────────────────────────────────────────────────────
// GET /api/orders  — Get current user's orders
// ────────────────────────────────────────────────────────────
exports.getMyOrders = async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const query = { user: req.user._id };
  if (req.query.status) query.status = req.query.status;

  const [orders, total] = await Promise.all([
    Order.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("items.product", "name images"),
    Order.countDocuments(query),
  ]);

  return paginatedResponse(
    res,
    "Orders fetched.",
    { orders },
    buildPaginationMeta(total, page, limit)
  );
};

// ────────────────────────────────────────────────────────────
// GET /api/orders/:id  — Get single order (owner or admin)
// ────────────────────────────────────────────────────────────
exports.getOrder = async (req, res) => {
  const order = await Order.findById(req.params.id).populate("items.product", "name images slug");
  if (!order) return errorResponse(res, "Order not found.", 404);

  // User can only see their own orders; admin sees all
  if (
    order.user.toString() !== req.user._id.toString() &&
    req.user.role !== "admin"
  ) {
    return errorResponse(res, "Not authorised to view this order.", 403);
  }

  return successResponse(res, "Order fetched.", { order });
};

// ────────────────────────────────────────────────────────────
// GET /api/admin/orders  — All orders (admin only)
// ────────────────────────────────────────────────────────────
exports.getAllOrders = async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { status, search } = req.query;

  const query = {};
  if (status) query.status = status;
  if (search) query.orderId = { $regex: search, $options: "i" };

  const [orders, total] = await Promise.all([
    Order.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("user", "name email")
      .populate("items.product", "name"),
    Order.countDocuments(query),
  ]);

  return paginatedResponse(
    res,
    "All orders fetched.",
    { orders },
    buildPaginationMeta(total, page, limit)
  );
};

// ────────────────────────────────────────────────────────────
// PATCH /api/admin/orders/:id/status  (admin only)
// ────────────────────────────────────────────────────────────
exports.updateOrderStatus = async (req, res) => {
  const { status, note, trackingNumber, estimatedDelivery } = req.body;

  const validStatuses = ["pending", "processing", "shipped", "delivered", "cancelled"];
  if (!validStatuses.includes(status)) {
    return errorResponse(res, `Invalid status. Valid: ${validStatuses.join(", ")}`, 400);
  }

  const order = await Order.findById(req.params.id);
  if (!order) return errorResponse(res, "Order not found.", 404);

  // Prevent going backwards (except to cancelled)
  const statusOrder = validStatuses;
  const currentIdx = statusOrder.indexOf(order.status);
  const newIdx = statusOrder.indexOf(status);
  if (status !== "cancelled" && newIdx < currentIdx) {
    return errorResponse(res, `Cannot revert order status from "${order.status}" to "${status}".`, 400);
  }

  // If cancelling, restore stock
  if (status === "cancelled" && order.status !== "cancelled") {
    const stockRestores = order.items.map((item) =>
      Product.findByIdAndUpdate(item.product, {
        $inc: { stock: item.quantity, soldCount: -item.quantity },
      })
    );
    await Promise.all(stockRestores);
  }

  order.status = status;
  if (note) order.statusHistory[order.statusHistory.length - 1].note = note;
  if (trackingNumber) order.trackingNumber = trackingNumber;
  if (estimatedDelivery) order.estimatedDelivery = estimatedDelivery;

  await order.save();
  return successResponse(res, "Order status updated.", { order });
};

// ────────────────────────────────────────────────────────────
// GET /api/admin/orders/stats  (admin only)
// ────────────────────────────────────────────────────────────
exports.getOrderStats = async (req, res) => {
  const stats = await Order.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        revenue: { $sum: "$total" },
      },
    },
  ]);

  const totalRevenue = await Order.aggregate([
    { $match: { paymentStatus: "paid" } },
    { $group: { _id: null, total: { $sum: "$total" } } },
  ]);

  return successResponse(res, "Stats fetched.", {
    byStatus: stats,
    totalRevenue: totalRevenue[0]?.total || 0,
  });
};
