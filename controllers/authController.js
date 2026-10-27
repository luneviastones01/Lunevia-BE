const User = require("../models/User");
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
} = require("../utils/jwt");
const { successResponse, errorResponse } = require("../utils/apiResponse");
const logger = require("../utils/logger");

// ── Helper: build safe user object ───────────────────────────
const sanitizeUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  avatar: user.avatar,
});

// ── Helper: issue tokens ──────────────────────────────────────
const issueTokens = async (user, res) => {
  const accessToken = generateAccessToken(user._id, user.role);
  const refreshToken = generateRefreshToken(user._id);

  // Persist refresh token (allow up to 5 concurrent sessions)
  await User.findByIdAndUpdate(user._id, {
    $push: {
      refreshTokens: {
        $each: [refreshToken],
        $slice: -5, // Keep last 5 tokens
      },
    },
  });

  setRefreshCookie(res, refreshToken);
  return accessToken;
};

// ────────────────────────────────────────────────────────────
// POST /api/auth/signup
// ────────────────────────────────────────────────────────────
exports.signup = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return errorResponse(res, "An account with this email already exists.", 409);
    }

    const user = await User.create({ name, email, password, phone });
    const accessToken = await issueTokens(user, res);

    return successResponse(
      res,
      "Account created successfully.",
      { user: sanitizeUser(user), accessToken },
      201
    );
  } catch (error) {
    logger.error(`Signup error: ${error.message}`);
    throw error; // Let global error handler process
  }
};

// ────────────────────────────────────────────────────────────
// POST /api/auth/login
// ────────────────────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Include password field explicitly (select: false by default)
    const user = await User.findOne({ email }).select("+password +refreshTokens");

    if (!user || !user.password) {
      return errorResponse(res, "Invalid email or password.", 401);
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return errorResponse(res, "Invalid email or password.", 401);
    }

    const accessToken = await issueTokens(user, res);

    return successResponse(res, "Logged in successfully.", {
      user: sanitizeUser(user),
      accessToken,
    });
  } catch (error) {
    logger.error(`Login error: ${error.message}`);
    throw error;
  }
};

// ────────────────────────────────────────────────────────────
// POST /api/auth/refresh
// ────────────────────────────────────────────────────────────
exports.refreshToken = async (req, res) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) return errorResponse(res, "Refresh token not found.", 401);

    let decoded;
    try {
      decoded = verifyRefreshToken(token);
    } catch {
      clearRefreshCookie(res);
      return errorResponse(res, "Invalid or expired refresh token.", 401);
    }

    const user = await User.findById(decoded.id).select("+refreshTokens");
    if (!user || !user.refreshTokens.includes(token)) {
      // Possible token reuse attack — invalidate all tokens
      if (user) {
        await User.findByIdAndUpdate(decoded.id, { $set: { refreshTokens: [] } });
        logger.warn(`Refresh token reuse detected for user ${decoded.id}`);
      }
      clearRefreshCookie(res);
      return errorResponse(res, "Refresh token invalid. Please log in again.", 401);
    }

    // Rotate: remove old token, issue new one
    await User.findByIdAndUpdate(decoded.id, { $pull: { refreshTokens: token } });
    const newAccessToken = await issueTokens(user, res);

    return successResponse(res, "Token refreshed.", { accessToken: newAccessToken });
  } catch (error) {
    logger.error(`Refresh token error: ${error.message}`);
    throw error;
  }
};

// ────────────────────────────────────────────────────────────
// POST /api/auth/logout
// ────────────────────────────────────────────────────────────
exports.logout = async (req, res) => {
  try {
    const token = req.cookies?.refreshToken;
    if (token) {
      // Invalidate this refresh token
      await User.findByIdAndUpdate(req.user._id, { $pull: { refreshTokens: token } });
    }
    clearRefreshCookie(res);
    return successResponse(res, "Logged out successfully.");
  } catch (error) {
    logger.error(`Logout error: ${error.message}`);
    throw error;
  }
};

// ────────────────────────────────────────────────────────────
// GET /api/auth/me
// ────────────────────────────────────────────────────────────
exports.getMe = async (req, res) => {
  return successResponse(res, "User profile fetched.", { user: sanitizeUser(req.user) });
};

// ────────────────────────────────────────────────────────────
// GET /api/auth/google/callback — handled by Passport
// POST /api/auth/google/session — return user after OAuth redirect
// ────────────────────────────────────────────────────────────
exports.googleCallback = async (req, res) => {
  try {
    const accessToken = await issueTokens(req.user, res);
    // Redirect frontend with token (or use postMessage)
    const redirectUrl = `${process.env.FRONTEND_URL}/auth/callback?token=${accessToken}`;
    res.redirect(redirectUrl);
  } catch (error) {
    logger.error(`Google callback error: ${error.message}`);
    res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_failed`);
  }
};
