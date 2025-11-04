// cron/cleanupLogs.js
import cron from "node-cron";
import prisma from "../config/Db.js";
import logger from "../middlewares/logger.js";
import { markInactiveUsersOffline } from "../jobs/markOffline.js";

// 🧹 Run cleanup every Sunday at midnight
cron.schedule("0 0 * * 0", async () => {
  try {
    const days = 90;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const deleted = await prisma.activityLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    logger.info(`🧹 Cleaned ${deleted.count} old activity logs.`);
  } catch (error) {
    logger.error("Failed to clean old logs:", error);
  }
});

cron.schedule("*/2 * * * *", markInactiveUsersOffline);