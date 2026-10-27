const jwt = require("jsonwebtoken");

/**
 * Generate a short-lived access token
 */
const generateAccessToken = (userId, role) => {
  return jwt.sign({ id: userId, role }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES || "15m",
  });
};

/**
 * Generate a long-lived refresh token
 */
const generateRefreshToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES || "7d",
  });
};

/**
 * Verify access token
 */
const verifyAccessToken = (token) => {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
};

/**
 * Verify refresh token
 */
const verifyRefreshToken = (token) => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
};

/**
 * Set refresh token as httpOnly cookie
 */
const setRefreshCookie = (res, token) => {
  res.cookie("refreshToken", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: "/api/auth/refresh",
  });
};

/**
 * Clear refresh token cookie
 */
const clearRefreshCookie = (res) => {
  res.clearCookie("refreshToken", { path: "/api/auth/refresh" });
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
};
