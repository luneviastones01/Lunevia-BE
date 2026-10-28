const crypto = require("crypto");
const express = require("express");
const router = express.Router();
const passport = require("passport");
const { body } = require("express-validator");
const authController = require("../controllers/authController");
const { protect } = require("../middleware/auth");
const { authLimiter, adminPinLimiter } = require("../middleware/rateLimiter");
const { validate } = require("../middleware/validate");
const {
  verifyAdminSession,
  clearAllAdminSessions,
} = require("../utils/adminSession");

// ── Validation rules ──────────────────────────────────────────────────────────
const signupRules = [
  body("name").trim().notEmpty().withMessage("Name is required").isLength({ max: 60 }),
  body("email").isEmail().normalizeEmail().withMessage("Valid email required"),
  body("phone")
    .optional()
    .matches(/^[\d\s\+\-\(\)]{7,15}$/)
    .withMessage("Valid phone number required"),
  body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage("Password must contain uppercase, lowercase, and a number"),
];

const loginRules = [
  body("email").isEmail().normalizeEmail().withMessage("Valid email required"),
  body("password").notEmpty().withMessage("Password is required"),
];

// ── Routes ────────────────────────────────────────────────────────────────────
router.post("/signup", authLimiter, signupRules, validate, authController.signup);
router.post("/login",  authLimiter, loginRules,  validate, authController.login);
router.post("/refresh", authController.refreshToken);
router.post("/logout", protect, authController.logout);
router.get("/me", protect, authController.getMe);

// Google OAuth
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"], session: false })
);
router.get(
  "/google/callback",
  passport.authenticate("google", { session: false, failureRedirect: "/login" }),
  authController.googleCallback
);

// ── Admin Passcode Verification ───────────────────────────────────────────────
// Rate-limited: max 10 attempts / 15 min window (defined in rateLimiter)
// Uses timing-safe compare to prevent timing attacks
router.post("/verify-pin", adminPinLimiter, async (req, res) => {
  const { pin } = req.body;
  if (!pin || typeof pin !== "string") {
    return res.status(400).json({ success: false, message: "Passcode required" });
  }

  const adminPasscode = process.env.ADMIN_PASSCODE || "1234";

  const pinHash    = crypto.createHash("sha256").update(String(pin).trim()).digest();
  const actualHash = crypto.createHash("sha256").update(String(adminPasscode).trim()).digest();
  const isMatch    = crypto.timingSafeEqual(pinHash, actualHash);

  if (!isMatch) {
    return res.status(401).json({ success: false, message: "Invalid admin passcode" });
  }

  // Generate a signed encrypted session token valid for 7 days
  const { createAdminSession } = require("../utils/adminSession");
  const sessionResult = await createAdminSession({
    ip:        req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "",
    userAgent: req.headers["user-agent"] || "",
  });

  return res.status(200).json({
    success:      true,
    message:      "Passcode verified",
    sessionToken: sessionResult.token,
    expiresAt:    sessionResult.expiresAt,
  });
});

// ── Verify Admin Session Token ────────────────────────────────────────────────
router.post("/verify-session", async (req, res) => {
  const token = req.headers["x-admin-session"] || req.body?.sessionToken;
  const result = await verifyAdminSession(token);
  if (!result.valid) {
    return res.status(401).json({ success: false, valid: false, message: result.reason || "Invalid or expired session" });
  }
  return res.status(200).json({ success: true, valid: true, expiresAt: result.session.expiresAt });
});

// ── Admin Logout ──────────────────────────────────────────────────────────────
router.post("/admin-logout", async (_req, res) => {
  await clearAllAdminSessions();
  return res.status(200).json({ success: true, message: "Admin session cleared." });
});

module.exports = router;
