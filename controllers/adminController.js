const User = require("../models/User");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Category = require("../models/Category");
const { successResponse } = require("../utils/apiResponse");

// ────────────────────────────────────────────────────────────
// GET /api/admin/dashboard
// ────────────────────────────────────────────────────────────
exports.getDashboardStats = async (req, res) => {
  const [
    totalUsers,
    totalProducts,
    totalOrders,
    totalCategories,
    revenueAgg,
    recentOrders,
    ordersByStatus,
    lowStockProducts,
  ] = await Promise.all([
    User.countDocuments(),
    Product.countDocuments({ isActive: true }),
    Order.countDocuments(),
    Category.countDocuments({ isActive: true }),

    // Total revenue from paid orders
    Order.aggregate([
      { $match: { paymentStatus: "paid" } },
      { $group: { _id: null, total: { $sum: "$total" }, count: { $sum: 1 } } },
    ]),

    // Last 5 orders
    Order.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("user", "name email")
      .lean(),

    // Orders grouped by status
    Order.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),

    // Products with stock <= 5
    Product.find({ isActive: true, stock: { $lte: 5 } })
      .select("name stock price")
      .sort({ stock: 1 })
      .limit(10)
      .lean(),
  ]);

  return successResponse(res, "Dashboard stats fetched.", {
    stats: {
      totalUsers,
      totalProducts,
      totalOrders,
      totalCategories,
      totalRevenue: revenueAgg[0]?.total || 0,
      paidOrders: revenueAgg[0]?.count || 0,
    },
    recentOrders,
    ordersByStatus,
    lowStockProducts,
  });
};

// ────────────────────────────────────────────────────────────
// GET /api/admin/revenue?period=monthly|weekly
// ────────────────────────────────────────────────────────────
exports.getRevenue = async (req, res) => {
  const { period = "monthly" } = req.query;

  const groupBy =
    period === "weekly"
      ? { $week: "$createdAt" }
      : { $month: "$createdAt" };

  const revenueData = await Order.aggregate([
    { $match: { paymentStatus: "paid" } },
    {
      $group: {
        _id: { period: groupBy, year: { $year: "$createdAt" } },
        revenue: { $sum: "$total" },
        orders: { $sum: 1 },
      },
    },
    { $sort: { "_id.year": 1, "_id.period": 1 } },
    { $limit: 12 },
  ]);

  return successResponse(res, "Revenue data fetched.", { revenueData });
};

// ────────────────────────────────────────────────────────────
// GET /api/admin/top-products
// ────────────────────────────────────────────────────────────
exports.getTopProducts = async (req, res) => {
  const topProducts = await Product.find({ isActive: true })
    .sort({ soldCount: -1 })
    .limit(10)
    .select("name soldCount price images")
    .lean();

  return successResponse(res, "Top products fetched.", { topProducts });
};
