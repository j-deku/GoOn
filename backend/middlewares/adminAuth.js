import jwt from "jsonwebtoken";
import UserModel from "../models/UserModel.js";
import AdminProfile from "../models/AdminProfile.js";
import dotenv from "dotenv";
import { getClientIP } from "../utils/getClientIP.js";
import { allowedIPs } from "../config/AdminSecurity.js";
import logger from "./logger.js";
import ipRangeCheck from "ip-range-check";
dotenv.config(); 

const verifyAdmin = async (req, res, next) => {
  const clientIP = getClientIP(req);

  const token = req.cookies.adminAccessToken;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await UserModel.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ success: false, message: "Admin user not found." });
    }
    const allowedRoles = ["admin", "super-admin", "admin-manager"];
    if (!user.roles.some(role => allowedRoles.includes(role))) {
      return res.status(401).json({ message: "Permission denied. Not an admin" });
    }

    const adminProfile = await AdminProfile.findOne({ user: user._id });
    if (!adminProfile) {
      return res.status(403).json({ success: false, message: "Admin profile not found." });
    }

    // ✅ IP Allowlisting for all admins (no exceptions)
    if (allowedIPs.length && !ipRangeCheck(clientIP, allowedIPs)) {
      logger.warn(`[SECURITY] Admin IP Blocked — IP: ${clientIP}, Email: ${user.email}, URL: ${req.originalUrl}`);
      return res.status(403).json({ success: false, message: `Access denied from this IP (${clientIP})` });
    }

    if (process.env.ENABLE_2FA === "true" && !adminProfile.is2FAVerified) {
      return res.status(403).json({ success: false, message: "2FA verification required." });
    }

    if (adminProfile.isDisabled) {
      return res.status(403).json({ success: false, message: "Account disabled." });
    }

    if (adminProfile.lockUntil && adminProfile.lockUntil > Date.now()) {
      return res.status(423).json({ success: false, message: "Account locked. Try again later." });
    }

    req.user = user;
    req.adminProfile = adminProfile;
    next();
  } catch (error) {
    if (["TokenExpiredError", "JsonWebTokenError", "NotBeforeError"].includes(error.name)) {
      return res.status(401).json({ success: false, message: "Token expired or invalid." });
    }
    logger.error("Admin authentication error:", error);
    return res.status(500).json({ success: false, message: "Authentication error." });
  }
};

export {verifyAdmin};