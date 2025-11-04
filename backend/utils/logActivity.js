import prisma from "../config/Db.js";
import { UAParser } from "ua-parser-js";

export const logActivity = async ({ userId, role, email, action, description, req }) => {
  try {
    const rawUA = req?.headers["user-agent"] || "Unknown";
    const parser = new UAParser(rawUA);
    const uaResult = parser.getResult();
    const userAgentSummary = `${uaResult.browser.name || "Unknown"} on ${uaResult.os.name || "Unknown"}`;

    const log = await prisma.activityLog.create({
      data: {
        userId,
        role,
        email,
        action,
        description,
        ipAddress: req?.ip || null,
        userAgent: userAgentSummary,
        rawUserAgent: rawUA,
      },
      include: {
        user: { select: { id: true, name: true, email: true, isOnline: true, lastLoginAt: true, lastActiveAt: true, } },
      },
    });

    return log;
  } catch (err) {
    console.error("❌ Activity log failed:", err.message);
  }
};
