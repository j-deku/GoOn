// utils/pushNotification.js
import admin from "../firebaseAdmin.js";
import logger from "../middlewares/logger.js";
import { removeTokenFromDatabase } from "./tokenService.js";
import dotenv from "dotenv";
dotenv.config();

const DEFAULT_OPTIONS = {
  maxRetries:        3,
  baseBackoffMillis: 500,
  ttlMillis:         3600 * 1000, // 1 hour
};

const origin = process.env.FRONTEND_URL.replace(/\/$/, ""); 
export async function sendPushNotification(
  fcmToken,
  { title, body, data = {} },
  opts = {}
) {
  const { maxRetries, baseBackoffMillis, ttlMillis } = {
    ...DEFAULT_OPTIONS,
    ...opts,
  };
  // Ensure all data values are strings
  const safeData = Object.fromEntries(
    Object.entries(data)
      .filter(([_, v]) => v != null)
      .map(([k, v]) => [k, String(v)])
  );
  // Build notification message
  const message = {
    token: fcmToken,
    // Top‑level notification for Web & some Android clients
    notification: {
      title,
      body,
    },
    data: safeData,
    android: {
      priority: "high",
      ttl: ttlMillis,
      notification: {
        title,
        body,
        icon: "call_away", 
        color: "#233963",  
        sound: "default", 
        click_action: "FLUTTER_NOTIFICATION_CLICK"
      }
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
        category: "RIDE_UPDATE"
      }
    }
  },
webpush: {
  headers: {
    TTL: String(ttlMillis / 1000)
  },
  notification: {
    title,
    body,
    icon: `${origin}/TT-logo.png`,
    badge: `${origin}/TT-logo.png`,
    actions: [
      { action: "view", title: "View Ride", icon: `${origin}/icons/view.png` },
      { action: "dismiss", title: "Dismiss", icon: `${origin}/icons/cross_icon.png` }
    ],
    vibrate: [100, 50, 100]
  },
  data: safeData 
},
  fcmOptions: {
    analyticsLabel: safeData.tag || "default"
  }
};
  // Exponential backoff retry loop
  function getBackoffDelay(attempt) {
    const cap = Math.min(baseBackoffMillis * 2 ** attempt, ttlMillis);
    return Math.random() * cap;
  }
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const messageId = await admin.messaging().send(message);
      logger.info("FCM message sent", { messageId, fcmToken, attempt });
      return messageId;
    } catch (err) {
      lastError = err;
    const { code, message } = err;
    logger.error("FCM send error", { code, message, attempt });
      // Drop invalid tokens
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token"      ||
        code === "messaging/invalid-argument"
      ) {
        await removeTokenFromDatabase(fcmToken);
        throw err;
      }
      if (attempt === maxRetries) {
        logger.error("Push notification failed after max retries", { fcmToken, maxRetries });
        throw err;
      }
      const delay = getBackoffDelay(attempt);
      logger.info("Retrying push notification", { nextAttempt: attempt + 1, delay });
      await new Promise(res => setTimeout(res, delay));
    }
  }
  throw lastError;
}

export async function sendPushToTopic(
  topic,
  { title, body, data = {} },
  opts = {}
) {
  const { maxRetries, baseBackoffMillis, ttlMillis } = {
    ...DEFAULT_OPTIONS,
    ...opts,
  };
  if (!topic || typeof topic !== "string") {
    throw new Error("Invalid topic for push notification");
  }
  const safeData = Object.fromEntries(
    Object.entries(data)
      .filter(([_, v]) => v != null)
      .map(([k, v]) => [k, String(v)])
  );
  const message = {
    topic,
    notification: { title, body },
    data: safeData,
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
          category: "TOPIC_ALERT"
        },
      },
    },
    webpush: {
      headers: {
        TTL: String(ttlMillis / 1000),
      },
      notification: {
        title,
        body,
        icon: `${origin}/icons/news.png`,
        badge: `${origin}/icons/badge.png`,
        vibrate: [100, 50, 100],
        actions: [
          { action: "view", title: "Open", icon: `${origin}/icons/view.png` },
          { action: "dismiss", title: "Dismiss", icon: `${origin}/icons/cross_icon.png` },
        ],
      },
      data: safeData,
    },

    fcmOptions: {
      analyticsLabel: safeData.tag || "topic-notification"
    }
  };
  function getBackoffDelay(attempt) {
    const cap = Math.min(baseBackoffMillis * 2 ** attempt, ttlMillis);
    return Math.random() * cap;
  }
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const messageId = await admin.messaging().send(message);
      logger.info("📢 Topic message sent", { topic, messageId, attempt });
      return messageId;
    } catch (err) {
      lastError = err;
      logger.error("❌ Topic push error", {
        topic,
        message: err.message,
        code: err.code,
        attempt
      });
      if (attempt === maxRetries) {
        logger.error("💥 Topic push failed after max retries", {
          topic,
          maxRetries,
        });
        throw err;
      }
      const delay = getBackoffDelay(attempt);
      logger.info("🔁 Retrying topic push", { attempt: attempt + 1, delay });
      await new Promise((res) => setTimeout(res, delay));
    }
  }
  throw lastError;
}

// subscribeTokenToTopic(token: string, topic: string)
export async function subscribeTokenToTopic(fcmToken, topic = "global-updates") {
  if (!fcmToken) throw new Error("No FCM token provided");
  const response = await admin.messaging().subscribeToTopic(fcmToken, topic);
  logger.info(`🔔 Subscribed token to topic "${topic}"`, { fcmToken, response });
  return response;
}
// unsubscribeTokenFromTopic(token: string, topic: string)
export async function unsubscribeTokenFromTopic(fcmToken, topic = "global-updates") {
  const response = await admin.messaging().unsubscribeFromTopic(fcmToken, topic);
  logger.info(`🔔 Subscribed token to topic "${topic}"`, { fcmToken, response });
  return response;
}
