import dotenv from "dotenv";
dotenv.config();

export const allowedIPs = process.env.ALLOWED_IPS?.split(",")
  .map(ip => ip.trim())
  .filter(Boolean) || [];
