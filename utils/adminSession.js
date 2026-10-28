const crypto = require("crypto");

const ALGO          = "aes-256-gcm";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function getKey() {
  const secret = process.env.SESSION_SECRET || process.env.JWT_ACCESS_SECRET || process.env.ADMIN_PASSCODE || "lunevia-admin-secure-key-2026";
  return crypto.createHash("sha256").update(String(secret)).digest();
}

/**
 * Create a signed, encrypted admin session token (7 days).
 * No single-session lock — multiple devices can hold valid tokens.
 */
async function createAdminSession({ ip = "", userAgent = "" } = {}) {
  const expiresAt = Date.now() + SEVEN_DAYS_MS;
  const sessionId = crypto.randomUUID();

  const payload = JSON.stringify({ sessionId, role: "admin", ip, expiresAt });

  const iv     = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  let encrypted = cipher.update(payload, "utf8", "hex");
  encrypted    += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  const token = `${iv.toString("hex")}:${authTag}:${encrypted}`;

  return { token, sessionId, expiresAt };
}

/**
 * Decrypt and verify an admin session token.
 * Token is self-contained — no DB lookup needed.
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
    const iv      = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted    += decipher.final("utf8");
    sessionPayload = JSON.parse(decrypted);
  } catch {
    return { valid: false, reason: "Invalid or tampered session token" };
  }

  if (!sessionPayload.expiresAt || Date.now() > sessionPayload.expiresAt) {
    return { valid: false, reason: "Session expired" };
  }

  return { valid: true, session: sessionPayload };
}

/**
 * Logout — no-op for token-based sessions (client drops the token).
 * Kept for API compatibility.
 */
async function clearAllAdminSessions() {
  return true;
}

module.exports = {
  createAdminSession,
  verifyAdminSession,
  clearAllAdminSessions,
  SEVEN_DAYS_MS,
};
