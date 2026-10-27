const { verifyAccessToken } = require("../utils/jwt");
const { errorResponse } = require("../utils/apiResponse");
const User = require("../models/User");
const logger = require("../utils/logger");
const { verifyAdminSession } = require("../utils/adminSession");

/**
 * protect — Verify JWT and attach user to req
 */
const protect = async (req, res, next) => {
  try {
    let token;

    // Extract from Authorization header (Bearer <token>)
    if (req.headers.authorization?.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return errorResponse(res, "Authentication required. Please log in.", 401);
    }

    // Verify token
    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return errorResponse(res, "Access token expired. Please refresh.", 401);
      }
      return errorResponse(res, "Invalid token.", 401);
    }

    // Check user still exists
    const user = await User.findById(decoded.id);
    if (!user) {
      return errorResponse(res, "The user belonging to this token no longer exists.", 401);
    }

    // Check if password was changed after token was issued
    if (user.changedPasswordAfter(decoded.iat)) {
      return errorResponse(res, "Password was recently changed. Please log in again.", 401);
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error(`Auth middleware error: ${error.message}`);
    return errorResponse(res, "Authentication failed.", 500);
  }
};

/**
 * restrictTo — Role-based access control
 * Usage: restrictTo("admin") or restrictTo("admin", "manager")
 */
const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return errorResponse(res, "You do not have permission to perform this action.", 403);
    }
    next();
  };
};

/**
 * optionalAuth — Attach user if token present, but don't block
 */
const optionalAuth = async (req, res, next) => {
  try {
    if (req.headers.authorization?.startsWith("Bearer ")) {
      const token = req.headers.authorization.split(" ")[1];
      const decoded = verifyAccessToken(token);
      req.user = await User.findById(decoded.id);
    }
    next();
  } catch {
    next(); // Token invalid — just proceed unauthenticated
  }
};

/**
 * adminAuth — Allows access if either valid admin JWT or correct x-admin-passcode header is provided
 */
const adminAuth = async (req, res, next) => {
  const adminPasscode = process.env.ADMIN_PASSCODE || "1234";
  const provided = req.headers["x-admin-passcode"] || req.headers["x-admin-pin"];
  if (provided && String(provided).trim() === String(adminPasscode).trim()) {
    req.user = { role: "admin", name: "Catalog Admin" };
    return next();
  }
  const sessionToken = req.headers["x-admin-session"];
  if (sessionToken) {
    const { valid } = await verifyAdminSession(sessionToken);
    if (valid) {
      req.user = { role: "admin", name: "Catalog Admin" };
      return next();
    }
  }
  return protect(req, res, () => restrictTo("admin")(req, res, next));
};

module.exports = { protect, restrictTo, optionalAuth, adminAuth };
