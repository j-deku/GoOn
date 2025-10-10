// middlewares/adminIPGuard.js
import ipRangeCheck from "ip-range-check";
import { getClientIP } from "../utils/getClientIP.js";
import { allowedIPs } from "../config/AdminSecurity.js";
import logger from "../middlewares/logger.js";

export const adminIPGuard = (req, res, next) => {
  const clientIP = getClientIP(req);
  const allowed = allowedIPs.length === 0 || ipRangeCheck(clientIP, allowedIPs);

  if (!allowed) {
    logger.warn(`[ADMIN BLOCKED] IP ${clientIP} attempted access to ${req.originalUrl}`);
    return res.status(403).json({ message: "Access Denied: Your IP is not whitelisted." });
  }

  next();
};

export const checkAdminIP = (req, res) => {
  const clientIP = getClientIP(req);
  const allowed = allowedIPs.length === 0 || ipRangeCheck(clientIP, allowedIPs);
  res.status(200).json({ allowed, ip: clientIP });
};
