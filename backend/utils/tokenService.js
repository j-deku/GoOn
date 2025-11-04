import prisma from "../config/Db.js";
import logger from "../middlewares/logger.js";
import { Counter } from "prom-client";

// Prometheus counter to track total FCM token removals
const tokenRemovalCounter = new Counter({
  name: "fcm_token_removals_total",
  help: "Total number of FCM tokens removed from user records",
  labelNames: ["fcmToken"],
});

/**
 * Remove an FCM token from all users that have it.
 * Prisma equivalent of Mongoose updateMany + $unset
 */
export async function removeTokenFromDatabase(fcmToken) {
  if (!fcmToken) {
    logger.warn("removeTokenFromDatabase called without fcmToken");
    return false;
  }

  try {
    // Find all users with this FCM token (for logging/metrics)
    const usersWithToken = await prisma.user.findMany({
      where: { fcmToken },
      select: { id: true, email: true },
    });

    if (usersWithToken.length === 0) {
      logger.warn("No users found with FCM token", { fcmToken });
      return false;
    }

    // Update users — set fcmToken to null (equivalent to $unset)
    const result = await prisma.user.updateMany({
      where: { fcmToken },
      data: { fcmToken: null },
    });

    if (result.count > 0) {
      tokenRemovalCounter.inc({ fcmToken }, result.count);
      logger.info("Unset fcmToken for user(s)", {
        fcmToken,
        count: result.count,
        affectedUsers: usersWithToken.map(u => u.email),
      });
      return true;
    }

    logger.warn("No user records modified during FCM token removal", { fcmToken });
    return false;
  } catch (err) {
    logger.error("Error removing FCM token", { fcmToken, error: err });
    throw err;
  }
}
