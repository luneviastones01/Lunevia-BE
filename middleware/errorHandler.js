const logger = require("../utils/logger");

/**
 * Global error-handling middleware.
 * Must be the LAST middleware registered in app.js.
 */
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";

  // ── Mongoose Validation Error ─────────────────────────────
  if (err.name === "ValidationError") {
    statusCode = 422;
    const errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return res.status(422).json({ success: false, message: "Validation failed", errors });
  }

  // ── Mongoose Duplicate Key ────────────────────────────────
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue)[0];
    message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists.`;
  }

  // ── Mongoose CastError (invalid ObjectId) ─────────────────
  if (err.name === "CastError") {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  }

  // ── JWT Errors ────────────────────────────────────────────
  if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid token. Please log in again.";
  }
  if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Token expired. Please log in again.";
  }

  // ── Multer Errors ─────────────────────────────────────────
  if (err.code === "LIMIT_FILE_SIZE") {
    statusCode = 413;
    message = "File too large. Maximum size is 5MB.";
  }
  if (err.code === "LIMIT_UNEXPECTED_FILE") {
    statusCode = 400;
    message = "Unexpected file field.";
  }

  // Log server errors
  if (statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} — ${err.stack || err.message}`);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

/**
 * 404 handler — mount BEFORE errorHandler
 */
const notFound = (req, res, next) => {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

module.exports = { errorHandler, notFound };
