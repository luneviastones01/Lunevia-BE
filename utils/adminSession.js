const crypto = require("crypto");
const mongoose = require("mongoose");
const AdminSession = require("../models/AdminSession");

const ALGO = "aes-256-gcm";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

// In-memory fallback if MongoDB connection is pending or offline
let memoryActiveSession = null;

function getKey() {
  const secret = process.env.SESSION_SECRET || process.env.JWT_ACCESS_SECRET || process.env.ADMIN_PASSCODE || "lunevia-admin-secure-key-2026";
  return crypto.createHash("sha256").update(String(secret)).digest();
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Get current active session if one exists and hasn't expired
 */
async function getActiveSession() {
  try {
    if (mongoose.connection.readyState === 1) {
      const dbSession = await AdminSession.findOne({
        isActive: true,
        expiresAt: { $gt: new Date() },
      }).lean();
      if (dbSession) return dbSession;
    }
  } catch {}

  // Fallback to memory
  if (memoryActiveSession && memoryActiveSession.isActive && memoryActiveSession.expiresAt > Date.now()) {
    return memoryActiveSession;
  }
  return null;
}

/**
 * Check if the admin portal is currently locked by an active session
 */
async function checkSessionLock() {
  const active = await getActiveSession();
  if (active) {
    return {
      locked: true,
      expiresAt: active.expiresAt,
    };
  }
  return { locked: false, expiresAt: null };
}

/**
 * Create a new admin session.
 * STRICT SINGLE-SESSION LOCK:
 * If an active session already exists, NO OTHER DEVICE CAN LOG IN until the session is cleared or expired.
 */
async function createAdminSession({ ip = "", userAgent = "" } = {}) {
  const existing = await getActiveSession();

  if (existing) {
    return {
      locked: true,
      message: "Access restricted. An administrative session is currently in progress.",
      expiresAt: existing.expiresAt,
    };
  }

  // Ensure any old expired documents are marked inactive
  await clearAllAdminSessions();

  const expiresAt = Date.now() + SEVEN_DAYS_MS;
  const sessionId = crypto.randomUUID();
  const payload = JSON.stringify({
    sessionId,
    role: "admin",
    expiresAt,
  });

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  let encrypted = cipher.update(payload, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  const token = `${iv.toString("hex")}:${authTag}:${encrypted}`;
  const tokenH = hashToken(token);

  try {
    if (mongoose.connection.readyState === 1) {
      await AdminSession.create({
        sessionId,
        tokenHash: tokenH,
        ip,
        userAgent,
        expiresAt: new Date(expiresAt),
        isActive: true,
      });
    }
  } catch {}

  memoryActiveSession = {
    sessionId,
    tokenHash: tokenH,
    ip,
    userAgent,
    expiresAt,
    isActive: true,
  };

  return {
    locked: false,
    token,
    sessionId,
    expiresAt,
  };
}

/**
 * Decrypt and verify an admin session token.
 * Only the bearer of the single active session in DB is authorized.
 */
async function verifyAdminSession(token) {
  if (!token || typeof token !== "string") {
    return { valid: false, reason: "Missing session token" };
  }

  const parts = token.split(":");
  if (parts.length !== 3) {
    return { valid: false, reason: "Malformed session token" };
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  let sessionPayload;
  try {
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    sessionPayload = JSON.parse(decrypted);
  } catch {
    return { valid: false, reason: "Invalid or tampered session token" };
  }

  if (!sessionPayload.expiresAt || Date.now() > sessionPayload.expiresAt) {
    return { valid: false, reason: "Session expired" };
  }

  // Verify against the single active session in DB
  const active = await getActiveSession();
  if (!active || active.sessionId !== sessionPayload.sessionId) {
    return { valid: false, reason: "Session is not active or has been cleared." };
  }

  return { valid: true, session: sessionPayload };
}

/**
 * Clear/deactivate the single active admin session (called on logout)
 */
async function clearAllAdminSessions() {
  try {
    if (mongoose.connection.readyState === 1) {
      await AdminSession.updateMany({ isActive: true }, { $set: { isActive: false } });
    }
  } catch {}
  memoryActiveSession = null;
  return true;
}

module.exports = {
  getActiveSession,
  checkSessionLock,
  createAdminSession,
  verifyAdminSession,
  clearAllAdminSessions,
  SEVEN_DAYS_MS,
};
