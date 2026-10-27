const rateLimit = require("express-rate-limit");
const { errorResponse } = require("../utils/apiResponse");

const handler = (req, res) =>
  errorResponse(res, "Too many requests from this IP. Please try again later.", 429);

/**
 * General API rate limiter
 */
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 min
  max: parseInt(process.env.RATE_LIMIT_MAX) || 5000,
  skip: (req) => {
    if (process.env.NODE_ENV === "development") return true;
    if (req.headers["x-admin-passcode"] || req.headers["x-admin-pin"]) return true;
    return false;
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});

/**
 * Stricter limiter for auth routes (prevent brute force)
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Only count failed attempts
  handler,
});

/**
 * Dedicated limiter for hidden admin PIN verification (strict brute force protection)
 */
const adminPinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: 5, // max 5 attempts per IP
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (_req, res) =>
    errorResponse(res, "Security lock: Too many failed passcode attempts. Please wait 15 minutes.", 429),
});

/**
 * Upload limiter
 */
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  handler,
});

module.exports = { apiLimiter, authLimiter, adminPinLimiter, uploadLimiter };
