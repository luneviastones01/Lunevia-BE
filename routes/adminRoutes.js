const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const userController = require("../controllers/userController");
const { protect, restrictTo } = require("../middleware/auth");

// All admin routes require authentication + admin role
router.use(protect, restrictTo("admin"));

// Dashboard
router.get("/dashboard", adminController.getDashboardStats);
router.get("/revenue", adminController.getRevenue);
router.get("/top-products", adminController.getTopProducts);

// User management
router.get("/users", userController.getAllUsers);
router.patch("/users/:id/role", userController.updateUserRole);
router.delete("/users/:id", userController.deleteUser);

module.exports = router;
