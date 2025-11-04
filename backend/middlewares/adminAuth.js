import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import ipRangeCheck from "ip-range-check";
import prisma from "../config/Db.js";
import { getClientIP } from "../utils/getClientIP.js";
import { allowedIPs } from "../config/AdminSecurity.js";
import logger from "./logger.js";

dotenv.config();

export const verifyAdmin = async (req, res, next) => {
  const clientIP = getClientIP(req);
  const token = req.cookies.adminAccessToken;

  if (!token) {
    return res.status(401).json({ success: false, message: "Missing admin token." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ✅ Fetch user + roleAssignments + adminProfile
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: {
        roleAssignments: true,  // this replaces user.roles
        adminProfile: true,
      },
    });

    if (!user) {
      return res.status(401).json({ success: false, message: "Admin user not found." });
    }

    // ✅ Extract roles properly
    const userRoles = user.roleAssignments.map(r => r.role);
    const allowedRoles = ["ADMIN", "SUPER_ADMIN", "ADMIN_MANAGER"];

    if (!userRoles.some(role => allowedRoles.includes(role))) {
      return res.status(403).json({ success: false, message: "Permission denied. Not an admin." });
    }

    if (!user.adminProfile) {
      return res.status(403).json({ success: false, message: "Admin profile not found." });
    }

    // ✅ IP Allowlist check
    if (allowedIPs.length && !ipRangeCheck(clientIP, allowedIPs)) {
      logger.warn(
        `[SECURITY] Admin IP Blocked — IP: ${clientIP}, Email: ${user.email}, URL: ${req.originalUrl}`
      );
      return res.status(403).json({
        success: false,
        message: `Access denied from this IP (${clientIP})`,
      });
    }

    // ✅ 2FA & account status checks
    const { is2FAVerified, isDisabled, lockUntil } = user.adminProfile;

    if (process.env.ENABLE_2FA === "true" && !is2FAVerified) {
      return res.status(403).json({ success: false, message: "2FA verification required." });
    }

    if (isDisabled) {
      return res.status(403).json({ success: false, message: "Account disabled." });
    }

    if (lockUntil && new Date(lockUntil) > new Date()) {
      return res.status(423).json({ success: false, message: "Account locked. Try again later." });
    }

    // ✅ All checks passed
    req.user = user;
    req.adminProfile = user.adminProfile;
    next();
  } catch (error) {
    if (["TokenExpiredError", "JsonWebTokenError", "NotBeforeError"].includes(error.name)) {
      return res.status(401).json({ success: false, message: "Token expired or invalid." });
    }
    logger.error("Admin authentication error:", error);
    return res.status(500).json({ success: false, message: "Authentication error." });
  }
};
