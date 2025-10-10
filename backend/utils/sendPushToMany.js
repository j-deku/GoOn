import admin from "../firebaseAdmin.js";
import logger from "../middlewares/logger.js";
import { removeTokenFromDatabase } from "./tokenService.js";
import dotenv from "dotenv";
dotenv.config();

const DEFAULT_OPTIONS = {
  maxRetries: 3,
  baseBackoffMillis: 500,
  ttlMillis: 3600 * 1000, // 1 hour
  chunkSize: 500, // FCM max
};

const origin = process.env.FRONTEND_URL?.replace(/\/$/, "") || "";

export async function sendPushToMany(
  tokens = [],
  { title, body, data = {} },
  opts = {}
) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    throw new Error("No tokens provided for sendPushToMany");
  }

  const { maxRetries, baseBackoffMillis, ttlMillis, chunkSize } = {
    ...DEFAULT_OPTIONS,
    ...opts,
  };

  const safeData = Object.fromEntries(
    Object.entries(data)
      .filter(([_, v]) => v != null)
      .map(([k, v]) => [k, String(v)])
  );

  const basePayload = {
    notification: { title, body },
    android: {
      ttl: ttlMillis,
      priority: "high",
      notification: {
        title,
        body,
        icon: "call_away",
        color: "#0055ff",
        sound: "default",
      },
    },
    apns: {
      headers: {
        "apns-priority": "10",
        "apns-expiration": `${Math.floor(Date.now() / 1000) + Math.floor(ttlMillis / 1000)}`
      },
      payload: {
        aps: {
          alert: { title, body },
          sound: "default",
          badge: Number(safeData.badgeCount || 1),
          category: "USER_ALERT"
        }
      }
    },
    webpush: {
      headers: { TTL: String(ttlMillis / 1000) },
      notification: {
        title,
        body,
        icon: `${origin}/icons/alert.png`,
        badge: `${origin}/icons/badge.png`,
        vibrate: [100, 50, 100],
        actions: [
          { action: "view", title: "Open", icon: `${origin}/icons/view.png` },
          { action: "dismiss", title: "Dismiss", icon: `${origin}/icons/cross_icon.png` }
        ],
      },
      data: safeData
    },
    fcmOptions: {
      analyticsLabel: safeData.tag || "bulk-push"
    },
    data: safeData
  };

  function getBackoffDelay(attempt) {
    const cap = Math.min(baseBackoffMillis * 2 ** attempt, ttlMillis);
    return Math.random() * cap;
  }

  const results = [];

  const chunks = [];
  for (let i = 0; i < tokens.length; i += chunkSize) {
    chunks.push(tokens.slice(i, i + chunkSize));
  }

  for (const chunk of chunks) {
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await admin.messaging().sendMulticast({
          ...basePayload,
          tokens: chunk,
        });

        logger.info(`📢 Sent to ${chunk.length} users`, {
          successCount: response.successCount,
          failureCount: response.failureCount,
        });

        // Handle failed tokens
        for (let i = 0; i < response.responses.length; i++) {
          const res = response.responses[i];
          const token = chunk[i];
          if (!res.success) {
            const { error } = res;
            if (
              error.code === "messaging/registration-token-not-registered" ||
              error.code === "messaging/invalid-registration-token"
            ) {
              logger.warn(`🔻 Removing invalid FCM token: ${token}`);
              await removeTokenFromDatabase(token);
            }
            results.push({ token, success: false, error: error.message });
          } else {
            results.push({ token, success: true });
          }
        }

        break; // Exit retry loop on success

      } catch (err) {
        lastError = err;
        logger.error("❌ Bulk push error", { message: err.message, attempt });
        if (attempt === maxRetries) throw err;
        const delay = getBackoffDelay(attempt);
        logger.info("🔁 Retrying bulk push", { nextAttempt: attempt + 1, delay });
        await new Promise(res => setTimeout(res, delay));
      }
    }

    if (lastError && maxRetries > 0) throw lastError;
  }

  return results;
}
