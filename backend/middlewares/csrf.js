// csrf.js
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

export function generateCsrfToken(req, res) {
  const token = crypto.randomBytes(24).toString("hex");
  res.cookie("csrfToken", token, {
    secure: process.env.NODE_ENV === "production",
    sameSite: "Strict",
    maxAge: 15 * 60 * 1000, // 15 minutes
  });
  return res.json({ csrfToken: token });
}

export function verifyCsrf(req, res, next) {
  const cookieToken = req.cookies.adminAccessToken || req.cookies.csrfToken || "";
  const headerToken = req.headers["x-csrf-token"] || "";
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ success: false, message: "CSRF validation failed." });
  }
  next();
}