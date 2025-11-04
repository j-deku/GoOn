// controllers/verifyBackupCode.js
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { setAppCookie } from "../utils/CookieHelper.js";
import prisma from "../config/Db.js";

dotenv.config();

// ---------- TOKEN HELPERS ----------
const signAccessToken = (user) =>
  jwt.sign({ id: user.id, roles: user.roles }, process.env.JWT_SECRET, {
    expiresIn: "1d",
  });

const signRefreshToken = (user) =>
  jwt.sign({ id: user.id }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: "7d",
  });

// ---------- VERIFY BACKUP CODE ----------
const verifyBackupCode = async (req, res) => {
  const { backupCode } = req.body;
  if (!backupCode) {
    return res
      .status(400)
      .json({ success: false, message: "Missing backup code." });
  }

  try {
    // ✅ Find user
    const user = await prisma.user.findUnique({
      where: { id: req.preAdminId },
      include: {
        adminProfile: {
          include: {
            backupCodes: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "Admin not found." });
    }

    const admin = user.adminProfile;
    if (!admin || !admin.backupCodes || admin.backupCodes.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No backup codes set up." });
    }

    // ✅ Check if backup code matches any unused code
    let matchedCode = null;
    for (const code of admin.backupCodes) {
      const valid = await bcrypt.compare(backupCode, code.code);
      if (valid && !code.used) {
        matchedCode = code;
        break;
      }
    }

    if (!matchedCode) {
      return res.status(401).json({
        success: false,
        message: "Invalid or already used backup code.",
      });
    }

    // ✅ Mark this backup code as used
    await prisma.backupCode.update({
      where: { id: matchedCode.id },
      data: { used: true },
    });

    // ✅ Mark 2FA verified if not already
    if (!admin.is2FAVerified) {
      await prisma.adminProfile.update({
        where: { id: admin.id },
        data: { is2FAVerified: true },
      });
    }

    // ✅ Generate and hash refresh token
    const accessToken = signAccessToken(user);
    const refreshTokenRaw = signRefreshToken(user);
    const hashedRefresh = await bcrypt.hash(refreshTokenRaw, 10);

    // ✅ Store refresh token in DB
    await prisma.refreshToken.create({
      data: {
        token: hashedRefresh,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    // ✅ Set secure cookies for admin
    setAppCookie(res, "adminRefreshToken", refreshTokenRaw, {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/api/admin",
    });

    setAppCookie(res, "adminAccessToken", accessToken, {
      maxAge: 15 * 60 * 1000,
      sameSite: "Strict",
      path: "/api/admin",
    });

    return res.status(200).json({
      success: true,
      message: "Backup code verification successful.",
      roles: user.roleAssignments?.map((r) => r.role) || ["ADMIN"],
    });
  } catch (err) {
    console.error("verifyBackupCode error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error.", error: err.message });
  }
};

export default verifyBackupCode;