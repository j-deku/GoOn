import bcrypt from "bcryptjs";
import UserModel from "../models/UserModel.js";
import AdminProfile from "../models/AdminProfile.js";
import {setAppCookie} from "../utils/CookieHelper.js";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

// ----------- TOKEN HELPERS -----------
const signAccessToken = (user) =>
  jwt.sign({ id: user._id, roles: user.roles }, process.env.JWT_SECRET, { expiresIn: "1d" });

const signRefreshToken = (user) =>
  jwt.sign({ id: user._id }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: "7d" });


const verifyBackupCode = async (req, res) => {
  const { backupCode } = req.body;
  if (!backupCode) {
    return res.status(400).json({ success: false, message: "Missing backup code." });
  }

  try {
    const user = await UserModel.findById(req.preAdminId);
    if (!user) {
      return res.status(404).json({ success: false, message: "Admin not found." });
    }
    const admin = await AdminProfile.findOne({ user: user._id });
    if (!admin || !admin.backupCodes || admin.backupCodes.length === 0) {
      return res.status(400).json({ success: false, message: "No backup codes set up." });
    }

    let matchIndex = -1;
    for (let i = 0; i < admin.backupCodes.length; i++) {
      const codeObj = admin.backupCodes[i];
      if (!codeObj.used && await bcrypt.compare(backupCode, codeObj.code)) {
        matchIndex = i;
        break;
      }
    }

    if (matchIndex === -1) {
      return res.status(401).json({ success: false, message: "Invalid or already used backup code." });
    }

    // Mark this code as used
    admin.backupCodes[matchIndex].used = true;
    await admin.save();

    if (!admin.is2FAVerified) {
      admin.is2FAVerified = true;
      await admin.save();
    }

    // Issue tokens (same as in verify2FA)
    const accessToken = signAccessToken(user);
    const refreshTokenRaw = signRefreshToken(user);
    const hashed = await bcrypt.hash(refreshTokenRaw, 10);

    if (!Array.isArray(user.refreshTokens)) user.refreshTokens = [];
    user.refreshTokens.push({
      token: hashed,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      revoked: false,
    });
    await user.save();

      setAppCookie(res, "adminRefreshToken", refreshTokenRaw, {
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path:"/api/admin",
      });
      setAppCookie(res, "adminAccessToken", accessToken, {
        maxAge: 15 * 60 * 1000,
        sameSite: "Strict", 
        path:"/api/admin",
      });

    return res.status(200).json({
      success: true,
      message: "Backup code verification successful.",
      roles: user.roles,
    });
  } catch (err) {
    console.error("verifyBackupCode error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

export default verifyBackupCode;