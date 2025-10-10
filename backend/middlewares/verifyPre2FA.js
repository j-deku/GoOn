import jwt from "jsonwebtoken";
import dotenv from 'dotenv';
dotenv.config();
const verifyPre2FAToken = (req, res, next) => {
  let token =
    (req.headers.authorization && req.headers.authorization.startsWith("Bearer "))
      ? req.headers.authorization.split(" ")[1]
      : req.cookies?.adminAccessToken;

  if (!token) {
    return res.status(401).json({ success: false, message: "Pre-2FA token missing." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.pre2FA || !decoded.id) {
      return res.status(401).json({ success: false, message: "Invalid pre-2FA token." });
    }
    req.preAdminId = decoded.id;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid or expired pre-2FA token." });
  }
};

export default verifyPre2FAToken;