import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import UserModel from "../models/UserModel.js";
import AdminProfile from "../models/AdminProfile.js";
import RideModel from "../models/RideModel.js";
import BookingModel from "../models/BookingModel.js";
import DriverProfile from "../models/DriverProfile.js";
import geocodeAddress from "../utils/geocodeAddress.js";
import CommissionModel from "../models/CommissionModel.js";
import { generateBackupCodes } from "../utils/generateBackupCodes.js";
import speakeasy from "speakeasy";
import qrcode from "qrcode";
import {io} from '../sever.js';
import { clearMultipleCookies, setAppCookie } from "../utils/CookieHelper.js";
import { notificationQueue } from "../queues/NotificationQueue.js";
import {connection as redis} from '../queues/connection.js';
import Joi from "joi";
import { normalizeIP } from "../utils/ip.js";
import { getClientIP } from "../utils/getClientIP.js";
import prisma from "../config/Db.js";
import logger from "../middlewares/logger.js";
import { logActivity } from "../utils/logActivity.js";
dotenv.config();

// =============== TOKEN HELPERS ===============
export const signAccessToken = (user) =>
  jwt.sign({ id: user.id, roles: user.roles }, process.env.JWT_SECRET, { expiresIn: "1d" });

export const signRefreshToken = (user) =>
  jwt.sign({ id: user.id }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: "7d" });

// =============== ENSURE SUPER ADMIN EXISTS ===============
export const ensureSuperAdminExists = async () => {
  try {
    const existingAdmin = await prisma.user.findUnique({
      where: { email: process.env.ADMIN_EMAIL },
    });

    if (existingAdmin) {
      console.log("✅ Super Admin already exists");
      return;
    }

    const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASS, 10);

    await prisma.user.create({
      data: {
        name: process.env.SUPER_ADMIN_NAME || "Super Admin",
        email: process.env.ADMIN_EMAIL,
        password: hashedPassword,
        verified: true,
        // ✅ Nested creation for roles
        roleAssignments: {
          create: [
            { role: "SUPER_ADMIN" },
            { role: "ADMIN" },
            { role: "ADMIN_MANAGER" },
            { role: "USER" },
          ],
        },
        adminProfile: {
          create: {
            is2FAVerified: true,
          },
        },
      },
    });

    console.log("🎉 Super Admin created successfully");
      const log = await logActivity({
      userId: req.user.id,
      role: req.user.roleAssignments.map((r) => r.role).join(", "),
      action: "SUPER_ADMIN_CREATED",
      description: `${req.user.name} accessed the admin dashboard`,
      req,
    });
      const io = req.app.get("io");
    if (io && log) {
      io.emit("new_activity_log", log);
    }
  } catch (error) {
    logger.error("❌ Error ensuring Super Admin:", error);
      const log = await logActivity({
      userId: req.user.id,
      role: req.user.roleAssignments.map((r) => r.role).join(", "),
      action: "🟥SUPER_ADMIN_CREATION_FAILED",
      description: `Failed attempt to access admin dashboard: ${error.message}`,
      req,
    });
      const io = req.app.get("io");
    if (io && log) {
      io.emit("new_activity_log", log);
    }
  }
};
// =============== CREATE ADMIN ===============
const createAdmin = async (req, res) => {
  const { name, email, password, twoFASecret } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ success: false, message: "Name, email, and password are required" });
  }

  if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
    return res.status(400).json({ success: false, message: "Invalid email format" });
  }

  if (password.length < 8) {
    return res.status(400).json({ success: false, message: "Password too short" });
  }

  const emailLower = email.toLowerCase();

  try {
    const existing = await prisma.user.findUnique({ where: { email: emailLower } });
    if (existing) {
      return res.status(409).json({ success: false, message: "User already exists" });
    }

    const hashed = await bcrypt.hash(password, 10);

    // ✅ Transaction for atomic creation
    const [user, adminProfile] = await prisma.$transaction([
      prisma.user.create({
        data: {
          name,
          email: emailLower,
          password: hashed,
          verified: true,
          roles: ["admin"],
        },
      }),
      prisma.adminProfile.create({
        data: {
          user: { connect: { email: emailLower } },
          twoFASecret: twoFASecret || null,
          is2FAVerified: false,
          isDisabled: false,
        },
      }),
    ]);

      const log = await logActivity({
      userId: req.user.id,
      role: req.user.roleAssignments.map((r) => r.role).join(", "),
      action: "ADMIN_CREATED",
      description: `${req.user.name} created new admin: ${user.name}`,
      req,
    });
      const io = req.app.get("io");
    if (io && log) {
      io.emit("new_activity_log", log);
    }

    return res.status(201).json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        roles: user.roles,
      },
      adminProfile: {
        id: adminProfile.id,
        userId: adminProfile.userId,
        is2FAVerified: adminProfile.is2FAVerified,
        isDisabled: adminProfile.isDisabled,
      },
    });
  } catch (error) {
    logger.error("❌ Admin creation failed:", error);
      const log = await logActivity({
      userId: req.user.id,
      role: req.user.roleAssignments.map((r) => r.role).join(", "),
      action: "ADMIN_CREATION_FAILED",
      description: `Failed attempt to create admin: ${error.message}`,
      req,
    });
      const io = req.app.get("io");
    if (io && log) {
      io.emit("new_activity_log", log);
    }
    return res.status(500).json({ success: false, message: "Admin creation failed" });
  }
};

const getAdminProfile = async (req, res) => {
  try {
    // 1. Get admin access token from cookie
    const token = req.cookies?.adminAccessToken;
    if (!token) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    // 2. Verify the JWT
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    // 3. Find the admin user and include adminProfile + roles
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: {
        adminProfile: true,
        roleAssignments: true,
      },
    });

    // 4. Validate existence and admin privileges
    if (
      !user ||
      !user.roleAssignments.some((r) =>
        ["ADMIN", "SUPER_ADMIN", "ADMIN_MANAGER"].includes(r.role)
      )
    ) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access — admin privileges required",
      });
    }

    // 5. Format response data
    const adminRoles = user.roleAssignments.map((r) => r.role);
    const profileData = {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      verified: user.verified,
      roles: adminRoles,
      adminProfile: user.adminProfile
        ? {
            id: user.adminProfile.id,
            is2FAVerified: user.adminProfile.is2FAVerified,
            isDisabled: user.adminProfile.isDisabled,
            failedLoginAttempts: user.adminProfile.failedLoginAttempts,
            lockUntil: user.adminProfile.lockUntil,
            createdAt: user.adminProfile.createdAt,
            updatedAt: user.adminProfile.updatedAt,
          }
        : null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    return res.status(200).json({
      success: true,
      message: "Admin profile fetched successfully",
      profile: profileData,
    });
  } catch (err) {
    logger.error("Error fetching admin profile:", err);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching admin profile",
    });
  }
};

// ====================
// Update Admin Profile (CRUD - UPDATE)
// ====================
const updateAdminAvatar = async (req, res) => {
  try {
    // Ensure a file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "File upload is required",
      });
    }

    // Extract user ID and new avatar URL
    const userId = req.user?.id;
    const avatarUrl = req.file.path;

    // Update avatar in the database
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { avatar: avatarUrl },
      select: { avatar: true },
    });

      const log = await logActivity({
      userId: req.user.id,
      role: req.user.roleAssignments.map((r) => r.role).join(", "),
      action: "ADMIN_AVATAR_UPDATED",
      description: `${req.user.name} updated their avatar`,
      req,
    });
      const io = req.app.get("io");
    if (io && log) {
      io.emit("new_activity_log", log);
    }

    return res.status(200).json({
      success: true,
      message: "Avatar updated successfully",
      user: { avatar: updatedUser.avatar },
    });
  } catch (error) {
    logger.error("Error updating admin avatar:", error);
      const log = await logActivity({
      userId: req.user.id,
      role: req.user.roleAssignments.map((r) => r.role).join(", "),
      action: "🔴ADMIN_AVATAR_UPDATE_FAILED",
      description: `Failed attempt to update avatar: ${error.message}`,
      req,
    });
      const io = req.app.get("io");
    if (io && log) {
      io.emit("new_activity_log", log);
    }
    return res.status(500).json({
      success: false,
      message: "Failed to update avatar",
    });
  }
};

const deleteAdminProfile = async (req, res) => {
  try {
    const userId = req.user?.id;

    // 1. Delete admin profile if it exists
    await prisma.adminProfile.deleteMany({
      where: { userId },
    });

    // 2. Remove all admin-related roles from the user
    await prisma.roleAssignment.deleteMany({
      where: {
        userId,
        role: { in: ["ADMIN", "SUPER_ADMIN", "ADMIN_MANAGER"] },
      },
    });

    // 3. Optional: If user should no longer be an admin at all, update status
    await prisma.user.update({
      where: { id: userId },
      data: {
        updatedAt: new Date(),
      },
    });

    return res.status(200).json({
      success: true,
      message: "Admin profile deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting admin profile:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete admin profile",
    });
  }
};

// --- LOGIN CONTROLLER 
const adminLogin = async (req, res) => {
  const { email, password } = req.body;
  const captchaToken = req.cookies?.admin_captcha;

  // --- CAPTCHA verification ---
  if (!captchaToken) {
    return res.status(400).json({ success: false, message: "Missing CAPTCHA token." });
  }

  try {
    const decoded = jwt.verify(captchaToken, process.env.CAPTCHA_SECRET);
    const { jti, ip: ipFromToken } = decoded;

    const normalizeIP = (ip) => {
      if (!ip) return "";
      return ip === "::1" ? "127.0.0.1" : ip.replace(/^::ffff:/, "");
    };

    const captchaIP = normalizeIP(ipFromToken);
    const requestIP = normalizeIP(getClientIP(req));

    if (captchaIP !== requestIP) {
      return res.status(403).json({
        success: false,
        message: "CAPTCHA verification failed. IP mismatch.",
      });
    }

    // Ensure CAPTCHA token hasn’t been reused
    const jtiKey = `security:captcha:jti:${jti}`;
    const tokenStatus = await redis.getdel(jtiKey);

    if (!tokenStatus || tokenStatus !== "valid") {
      return res.status(403).json({
        success: false,
        message: "CAPTCHA token invalid or already used.",
      });
    }

    res.clearCookie("admin_captcha", { path: "/api/admin" });
  } catch (err) {
    logger.warn("CAPTCHA verification failed", { error: err.message });
    return res.status(403).json({ success: false, message: "CAPTCHA verification failed. Try again." });
  }

  // --- Input validation ---
  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Email and password required." });
  }

  try {
    // --- Look up user ---
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        roleAssignments: true,
        adminProfile: true,
      },
    });

    const allowedRoles = ["ADMIN", "SUPER_ADMIN", "ADMIN_MANAGER"];
    const hasAdminRole = user?.roleAssignments?.some((r) => allowedRoles.includes(r.role));

    if (!user || !hasAdminRole) {
      return res.status(401).json({ success: false, message: "Unauthorized access." });
    }

    const admin = user.adminProfile;
    if (!admin) {
      return res.status(401).json({ success: false, message: "Admin profile missing or invalid." });
    }

    // --- Account lock check ---
    if (admin.lockUntil && admin.lockUntil > new Date()) {
      return res.status(423).json({
        success: false,
        message: `Account locked until ${new Date(admin.lockUntil).toLocaleString()}`,
      });
    }

    // --- Password validation ---
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      const failedAttempts = admin.failedLoginAttempts + 1;
      const updates = {
        failedLoginAttempts: failedAttempts >= 10 ? 0 : failedAttempts,
        lockUntil: failedAttempts >= 10 ? new Date(Date.now() + 15 * 60 * 1000) : null,
      };

      await prisma.adminProfile.update({
        where: { id: admin.id },
        data: updates,
      });

      return res.status(401).json({ success: false, message: "Invalid credentials." });
    }

    // Reset failed attempts
    await prisma.adminProfile.update({
      where: { id: admin.id },
      data: { failedLoginAttempts: 0, lockUntil: null },
    });

    // --- IP allowlist ---
    const allowedIPs = process.env.ALLOWED_IPS
      ? process.env.ALLOWED_IPS.split(",").map((ip) => ip.trim())
      : [];

    let clientIP = req.headers["x-forwarded-for"] || req.connection.remoteAddress || "";
    if (clientIP.includes(",")) clientIP = clientIP.split(",")[0].trim();
    if (clientIP === "::1") clientIP = "127.0.0.1";

    if (allowedIPs.length && !allowedIPs.includes(clientIP)) {
      return res.status(403).json({
        success: false,
        message: "Access denied from this IP address.",
      });
    }

    // --- Two-Factor Authentication ---
    if (process.env.ENABLE_2FA === "true" && !admin.is2FAVerified) {
      const tempToken = jwt.sign(
        { id: user.id, pre2FA: true, roleAssignments: user.roleAssignments.map((r) => r.role) },
        process.env.JWT_SECRET,
        { expiresIn: "5m" }
      );

      return res.status(403).json({
        success: false,
        message: "2FA verification required.",
        pre2FAToken: tempToken,
      });
    }

    // --- Token generation ---
    const accessToken = signAccessToken(user);
    const refreshTokenRaw = signRefreshToken(user);
    const hashedRefresh = await bcrypt.hash(refreshTokenRaw, 10);

    // Keep last 4 valid tokens
    const activeTokens = (user.refreshTokens || [])
      .filter((t) => !t.revoked && (!t.expiresAt || t.expiresAt > new Date()))
      .slice(-4);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        refreshTokens: {
          deleteMany: {},
          create: [
            ...activeTokens,
            {
              token: hashedRefresh,
              createdAt: new Date(),
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              revoked: false,
            },
          ],
        },
        lastLoginAt: new Date(),
        lastActiveAt: new Date(),
        isOnline: true,
      },
    });

    // --- Set cookies ---
    setAppCookie(res, "adminRefreshToken", refreshTokenRaw, {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/api/admin",
    });

    setAppCookie(res, "adminAccessToken", accessToken, {
      maxAge: 15 * 60 * 1000,
      path: "/api/admin",
    });

    res.clearCookie("admin_captcha", { path: "/api/admin" });

      const log = await logActivity({
      userId: user.id,
      role: user.roleAssignments.map((r) => r.role).join(", "),
      action: "ADMIN_LOGIN",
      description: `${user.name } logged in successfully`,
      req,
    });
      const io = req.app.get("io");
    if (io && log) {
      io.emit("new_activity_log", log);
    }

    return res.status(200).json({
      success: true,
      message: "Login successful",
      roles: user.roleAssignments.map((r) => r.role),
      id: user.id,
    });
  } catch (error) {
    logger.error("adminLogin failed:", { error });
      const log = await logActivity({
      userId: req.user.id,
      role: req.user.roleAssignments.map((r) => r.role).join(", "),
      action: "ADMIN_LOGIN_FAILED",
      description: `Failed attempt to login as admin: ${error.message}`,
      req,
    });
      const io = req.app.get("io");
    if (io && log) {
      io.emit("new_activity_log", log);
    }
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
    });
  }
};

const strongPwdRegex = /^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[!@#$%^&*]).{8,}$/;

const changePassword = async (req, res) => {
  const { current, newPassword, confirmPassword } = req.body;

  if (!current || !newPassword || !confirmPassword) {
    return res.status(400).json({ message: "All fields are required." });
  }

  if (!strongPwdRegex.test(newPassword)) {
    return res.status(400).json({
      message: "Password does not meet complexity requirements.",
    });
  }

  if (newPassword !== confirmPassword) {
    return res
      .status(400)
      .json({ message: "New password and confirmation do not match." });
  }

  try {
    // ✅ Find the user from Prisma (using the authenticated ID)
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, password: true },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // ✅ Check if current password matches
    const match = await bcrypt.compare(current, user.password);
    if (!match) {
      return res
        .status(401)
        .json({ message: "Current password is incorrect. ❌" });
    }

    // ✅ Ensure new password is different
    const isSameAsOld = await bcrypt.compare(newPassword, user.password);
    if (isSameAsOld) {
      return res.status(400).json({
        message: "New password must be different from the old password.",
      });
    }

    // ✅ Hash new password and update
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });


      const log = await logActivity({
      userId: user.id,
      action: "ADMIN_PASSWORD_CHANGED",
      description: `${user.name} changed password successfully`,
      email: user.email,
      req,
    });
      const io = req.app.get("io");
    if (io && log) {
      io.emit("new_activity_log", log);
    }

    return res.json({
      success: true,
      message: "Password changed successfully. ✅",
    });
  } catch (err) {
    console.error("Error changing password:", err);
    return res
      .status(500)
      .json({ message: "Server error during password change." });
  }
};

// ====================
// Forgot Password
// ====================
const forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await prisma.user.findFirst({
      where: {
        email,
        roleAssignments: {
          some: {
            role: { in: ["ADMIN", "SUPER_ADMIN", "ADMIN_MANAGER"] },
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ message: "Admin not found" });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour


    // ✅ Save token first (before email)
    await prisma.user.update({
      where: { id: user.id },
      data: { 
        resetToken: hashedToken, 
        resetTokenExpires: expiresAt,
      },
    });

    console.log("✅ Reset token stored for:", user.email);

    const resetLink = `${process.env.FRONTEND_URL}/Oauth2/v1/admin/reset-password/${resetToken}`;

    // ✅ Send Email
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      to: user.email,
      subject: "Admin Password Reset",
      html: `
        <p>Click the link below to reset your password:</p>
        <a href="${resetLink}">${resetLink}</a>
        <p>This link will expire in 1 hour.</p>
      `,
    });

    const log = await logActivity({
      userId: user.id,
      action: "FORGOT_ADMIN_PASSWORD",
      description: `Password reset email sent to ${user.email}`,
      req,
    });

    const io = req.app.get("io");
    if (io && log) io.emit("new_activity_log", log);

    return res.json({ message: "Password reset email sent ✅" });
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(500).json({ message: error.message || "Server error" });
  }
};
// ====================
// Reset Password
// ====================
const resetPassword = async (req, res) => {
  const { token } = req.params;
  const { newPassword } = req.body;

  try {
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    const user = await prisma.user.findFirst({
      where: {
        resetToken: hashedToken,
        resetTokenExpires: { gt: new Date() },
        roleAssignments: {
          some: {
            role: {
              in: ["ADMIN", "SUPER_ADMIN", "ADMIN_MANAGER"],
            },
          },
        },
      },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    // ✅ Hash and update new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpires: null,
      },
    });

      const log = await logActivity({
      userId: user.id,
      action: "RESET_ADMIN_PASSWORD",
      description: `Admin password reset successfully for ${user.email}`,
      email: user.email,
      req,
    });
      const io = req.app.get("io");
    if (io && log) {
      io.emit("new_activity_log", log);
    }

    return res.json({ message: "Password reset successful ✅" });
  } catch (error) {
    logger.error("Reset password error:", error);
      const log = await logActivity({
      userId: user.id,
      action: "🔴RESET_ADMIN_PASSWORD_FAILED",
      description: `Failed attempt to reset admin password for ${user.email}: ${error.message}`,
      email: user.email,
      req,
    });
      const io = req.app.get("io");
    if (io && log) {
      io.emit("new_activity_log", log);
    }
    return res.status(500).json({ message: error.message || "Server error" });
  }
};

// ====================
// Dashboard Statistics
// ====================
const getDashboardStats = async (req, res) => {
  try {
    // Total Bookings
    const totalBookings = await prisma.booking.count();

    // Total Revenue
    const totalRevenueAgg = await prisma.booking.aggregate({
      _sum: { amount: true },
    });
    const totalRevenue = totalRevenueAgg._sum.amount || 0;

    // Total Rides
    const totalRides = await prisma.ride.count();

    // Total Users
    const totalUsers = await prisma.user.count();

    // Total Drivers
    const totalDrivers = await prisma.driverProfile.count();

      const log = await logActivity({
      userId: req.user.id,
      role: req.user.roleAssignments.map((r) => r.role).join(", "),
      action: "VIEW_ADMIN_DASHBOARD",
      description: `Admin dashboard viewed by ${req.user.email}`,
      req,
    });
      const io = req.app.get("io");
    if (io && log) {
      io.emit("new_activity_log", log);
    }

    return res.status(200).json({
      success: true,
      stats: {
        totalBookings,
        totalRevenue,
        totalRides,
        totalUsers,
        totalDrivers,
      },
    });
  } catch (error) {
    logger.error("Error fetching dashboard stats:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching dashboard stats.",
    });
  }
};

// ====================
// Get Monthly Revenue
// ====================
const getMonthlyRevenue = async (req, res) => {
  try {
    // Fetch all bookings with date + amount
    const bookings = await prisma.booking.findMany({
      select: { bookingDate: true, amount: true },
    });

    // Group by month in JS (since Prisma lacks direct $month support)
    const monthlyRevenue = Array(12).fill(0);

    bookings.forEach((b) => {
      if (b.bookingDate && b.amount) {
        const month = new Date(b.bookingDate).getMonth(); // 0-based index
        monthlyRevenue[month] += Number(b.amount);
      }
    });

    // Transform to structured array
    const data = monthlyRevenue.map((revenue, i) => ({
      month: i + 1,
      revenue,
    }));

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Error fetching monthly revenue:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ====================
// Booking Status Distribution (for a Pie Chart)
// ====================
const getBookingStatusDistribution = async (req, res) => {
  try {
    // Fetch all statuses
    const bookings = await prisma.booking.findMany({
      select: { status: true },
    });

    // Group counts by status
    const statusCount = {};
    bookings.forEach((b) => {
      const status = b.status || "Unknown";
      statusCount[status] = (statusCount[status] || 0) + 1;
    });

    // Transform into chart-friendly format
    const data = Object.entries(statusCount).map(([name, value]) => ({
      name,
      value,
    }));

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Error fetching booking status distribution:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error while fetching status distribution." });
  }
};

// ====================
// Get Monthly Bookings (for a Bar Chart)
// ====================
const getMonthlyBookings = async (req, res) => {
  try {
    // Fetch all booking dates
    const bookings = await prisma.booking.findMany({
      select: { bookingDate: true },
    });

    // Group by month in JS
    const monthlyBookings = Array(12).fill(0);

    bookings.forEach((b) => {
      if (b.bookingDate) {
        const month = new Date(b.bookingDate).getMonth(); // 0-based
        monthlyBookings[month] += 1;
      }
    });

    // Transform for chart
    const data = monthlyBookings.map((bookings, i) => ({
      month: i + 1,
      bookings,
    }));

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Error fetching monthly bookings:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error while fetching monthly bookings." });
  }
};

const getAllRides = async (req, res) => {
  try {
    const rides = await prisma.ride.findMany({
      include: {
        driver: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            driverProfile: {
              select: {
                vehicleType: true,
                model: true,
                registrationNumber: true,
                status: true,
                isAvailable: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.status(200).json({ success: true, rides });
  } catch (error) {
    console.error("Error fetching rides:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching rides.",
    });
  }
};

// ====================
// Get a specific ride by its ID
// ====================
const getRideById = async (req, res) => {
  try {
    const { id } = req.params;

    const ride = await prisma.ride.findUnique({
      where: { id: Number(id) },
      include: {
        driver: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            driverProfile: {
              select: {
                vehicleType: true,
                model: true,
                registrationNumber: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!ride) {
      return res.status(404).json({ success: false, message: "Ride not found." });
    }

    res.status(200).json({ success: true, ride });
  } catch (error) {
    console.error("Error fetching ride:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching ride.",
    });
  }
};

// ====================
// Get all drivers with their profile
// ====================
const getAllDrivers = async (req, res) => {
  try {
    const drivers = await prisma.user.findMany({
      where: {
        roleAssignments: {
          some: { role: "DRIVER" },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        roleAssignments: true,
        driverProfile: {
          select: {
            id: true,
            phone: true,
            licenseNumber: true,
            vehicleType: true,
            model: true,
            registrationNumber: true,
            capacity: true,
            rating: true,
            totalRides: true,
            status: true,
            approved: true,
            isAvailable: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Re-map to a simplified structure
    const formattedDrivers = drivers.map((driver) => ({
      id: driver.id,
      name: driver.name,
      email: driver.email,
      avatar: driver.avatar,
      roles: driver.roleAssignments.map((r) => r.role),
      profile: driver.driverProfile || null,
    }));

    res.status(200).json({ success: true, drivers: formattedDrivers });
  } catch (error) {
    console.error("Error fetching drivers:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching drivers.",
    });
  }
};

const approveDriver = async (req, res) => {
  try {
    const { driverId } = req.params;
    const numericId = Number(driverId);

    if (!numericId || isNaN(numericId)) {
      return res.status(400).json({ success: false, message: "Invalid or missing driverId." });
    }

    // Find driver's profile
    const profile = await prisma.driverProfile.findFirst({
      where: { userId: numericId },
    });


    if (!profile) {
  console.warn("No driver profile found for userId:", numericId);
  return res.status(404).json({ success: false, message: "Driver profile not found." });
}


    // Update approval status
    const updatedProfile = await prisma.driverProfile.update({
      where: { userId: numericId },
      data: {
        approved: true,
        status: "active",
      },
    });

      const log = await logActivity({
      userId: req.user.id,
      role: req.user.roleAssignments.map((r) => r.role).join(", "),
      action: "APPROVE_DRIVER",
      description: `Approved driver by ${req.user.email}`,
      req,
    });
      const io = req.app.get("io");
    if (io && log) {
      io.emit("new_activity_log", log);
    }

    return res.status(200).json({
      success: true,
      message: "Driver approved successfully.",
      profile: updatedProfile,
    });
  } catch (error) {
    console.error("Error approving driver:", error);
    return res.status(500).json({ success: false, message: "Server error while approving driver." });
  }
};

// Assign a ride to a driver
const assignRideToDriver = async (req, res) => {
  try {
    const { rideId, driverId } = req.body;
    const numericRideId = Number(rideId);
    const numericDriverId = Number(driverId);

    if (!numericRideId || !numericDriverId) {
      return res.status(400).json({ message: "Missing or invalid rideId or driverId." });
    }

    // Validate ride existence
    const ride = await prisma.ride.findUnique({ where: { id: numericRideId } });
    if (!ride) return res.status(404).json({ message: "Ride not found." });

    // Validate driver existence + profile
    const driver = await prisma.user.findUnique({
      where: { id: numericDriverId },
      include: {
        roleAssignments: true,
        driverProfile: true,
      },
    });

    if (!driver || !driver.roleAssignments.some((r) => r.role === "DRIVER")) {
      return res.status(404).json({ message: "Driver not found or not authorized." });
    }

    if (!driver.driverProfile) {
      return res.status(404).json({ message: "Driver profile not found." });
    }

    // Check max active rides
    const activeRidesCount = await prisma.ride.count({
      where: {
        driverId: numericDriverId,
        status: { in: ["SCHEDULED", "IN_PROGRESS", "ASSIGNED", "PENDING_APPROVAL"] },
      },
    });

    if (activeRidesCount >= 4) {
      return res.status(400).json({ message: "Driver already has maximum active rides assigned." });
    }

    // ✅ Transaction: update ride + driver profile atomically
    const [updatedRide, updatedDriverProfile] = await prisma.$transaction([
      prisma.ride.update({
        where: { id: numericRideId },
        data: {
          driverId: numericDriverId,
          status: "ASSIGNED",
        },
        include: {
          driver: {
            select: {
              id: true,
              name: true,
              email: true,
              driverProfile: true,
            },
          },
        },
      }),

      prisma.driverProfile.update({
        where: { userId: numericDriverId },
        data: {
          status: "active",
          isAvailable: false,
        },
      }),
    ]);

    // ✅ Emit event (if socket.io integrated)
    if (typeof io !== "undefined") {
      io.to(numericDriverId.toString()).emit("rideUpdate", { ride: updatedRide });
      console.log(`Emitted rideUpdate event to driver ${numericDriverId}`);
    }

    res.json({
      success: true,
      message: "Ride assigned successfully.",
      ride: updatedRide,
      driverProfile: updatedDriverProfile,
    });
  } catch (error) {
    console.error("Error assigning ride (transaction):", error);
    res.status(500).json({ message: "Server error while assigning ride." });
  }
};

// Update a ride's status
const updateRideStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const numericId = Number(id);

    if (!numericId || !status) {
      return res.status(400).json({ message: "Invalid ride ID or missing status." });
    }

    const ride = await prisma.ride.findUnique({ where: { id: numericId } });
    if (!ride) return res.status(404).json({ message: "Ride not found." });

    const updatedRide = await prisma.ride.update({
      where: { id: numericId },
      data: { status },
    });

    res.json({ success: true, message: "Ride status updated successfully.", ride: updatedRide });
  } catch (error) {
    console.error("Error updating ride status:", error);
    res.status(500).json({ message: "Server error while updating ride status." });
  }
};

/**
 * GET /api/admin/driver/:id
 * Retrieves a specific driver by user ID.
 */
const getDriverById = async (req, res) => {
  try {
    const { id } = req.params;
    const numericId = Number(id);

    // Fetch the user with only relevant fields
    const user = await prisma.user.findUnique({
      where: { id: numericId },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        roleAssignments: {
          select: { role: true },
        },
        driverProfile:{
          select: {
            id: true,
            phone: true,
            licenseNumber: true,
            vehicleType: true,
            model: true,
            registrationNumber: true,
            capacity: true,
        },
      },
      },
    });

    if (!user) {
      return res.status(404).json({ message: "Driver not found." });
    }

    const hasDriverRole = user.roleAssignments.some(r => r.role === "DRIVER");
    if (!hasDriverRole) {
      return res.status(404).json({ message: "Driver not found." });
    }

    // Fetch driver's profile
    const profile = await prisma.driverProfile.findUnique({
      where: { userId: numericId },
    });

    return res.json({ driver: { ...user, profile } });
  } catch (error) {
    console.error("Error fetching driver:", error);
    return res.status(500).json({ message: "Server error." });
  }
};

/**
 * GET /api/admin/bookings
 * Retrieves all bookings.
 */
const getAllBookings = async (req, res) => {
  try {
    const bookings = await prisma.booking.findMany({
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        driver: {
          select: { id: true, name: true },
        },
      },
    });

          const log = await logActivity({
            userId: req.user.id,
            action: "GET_ALL_BOOKINGS",
            description: `Fetched all bookings`,
            req,
          });

            const io = req.app.get("io");
          if (io && log) {
            io.emit("new_activity_log", log);
          }

    return res.json({ bookings });
  } catch (error) {
    logger.error("Error fetching bookings:", error);
          const log = await logActivity({
            userId: req.user.id,
            action: "🔴GET_ALL_BOOKINGS_FAILED",
            description: `Failed to fetch bookings: ${error.message}`,
            req,
          });

            const io = req.app.get("io");
          if (io && log) {
            io.emit("new_activity_log", log);
          }

    return res.status(500).json({ message: "Server error." });
  }
};

/**
 * GET /api/admin/commission
 * Retrieves the current active commission rate.
 */
const getCommissionRate = async (req, res) => {
  const adminId = req.user?.id;
  try {
    const config = await prisma.commissionConfig.findFirst({
      where: { active: true },
      orderBy: { effectiveFrom: "desc" },
    });

    if (!config) {
      return res.json({ success: true, rate: 0 });
    }

          const log = await logActivity({
            userId: adminId,
            action: "GET_COMMISSION_RATE",
            description: `Fetched current commission rate of ${config.rate * 100}%`,
            req,
          });

            const io = req.app.get("io");
          if (io && log) {
            io.emit("new_activity_log", log);
          }

    return res.json({ success: true, rate: config.rate });
  } catch (err) {
    logger.error("Error fetching commission rate:", err);
          const log = await logActivity({
            userId: adminId,
            action: "🔴GET_COMMISSION_RATE_FAILED",
            description: `Failed to fetch commission rate: ${err.message}`,
            req,
          });

            const io = req.app.get("io");
          if (io && log) {
            io.emit("new_activity_log", log);
          }

    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * POST /api/admin/commission
 * Sets a new platform commission rate.
 * Body: { rate: Number (0–1), effectiveFrom?: Date }
 */
const setCommissionRate = async (req, res) => {
  try {
    const { rate, effectiveFrom } = req.body;
    const adminId = req.user.id;

    if (rate == null || rate < 0 || rate > 1) {
      return res
        .status(400)
        .json({ success: false, message: "Rate must be between 0 and 1" });
    }

    // Deactivate existing configs
    await prisma.commissionConfig.updateMany({
      where: { active: true },
      data: { active: false },
    });

    // Create and activate new config
    const config = await prisma.commissionConfig.create({
      data: {
        rate,
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
        active: true,
      },
    });

      const log = await logActivity({
            userId: adminId,
            action: "SET_COMMISSION_RATE",
            description: `Commission rate updated to ${rate * 100}%`,
            req,
          });

            const io = req.app.get("io");
          if (io && log) {
            io.emit("new_activity_log", log);
          }

    return res.json({ success: true, config });
  } catch (err) {
    logger.error("Error setting commission rate:", err);
          const log = await logActivity({
            userId: adminId,
            action: "🔴SET_COMMISSION_RATE_FAILED",
            description: `Failed to update commission rate: ${err.message}`,
            req,
          });

            const io = req.app.get("io");
          if (io && log) {
            io.emit("new_activity_log", log);
          }

    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const addRide = async (req, res) => {
  try {
    const {
      pickup,
      destination,
      price,
      description,
      selectedDate,
      selectedTime,
      capacity,
      type,
      status,
      driverId,
    } = req.body;

    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "Image is required" });
    }

    // Geocode pickup and destination
    let pickupCoords, destinationCoords;
    try {
      pickupCoords = await geocodeAddress(pickup);
      destinationCoords = await geocodeAddress(destination);
    } catch (geoError) {
      return res
        .status(400)
        .json({ success: false, message: geoError.message });
    }

    // Commission and payout defaults
    const commissionRate = 0.2;
    const commissionAmount = price * commissionRate;
    const payoutAmount = price - commissionAmount;

    const ride = await prisma.ride.create({
      data: {
        pickup,
        destination,
        pickupNorm: pickup.toLowerCase(),
        destinationNorm: destination.toLowerCase(),
        price: parseFloat(price),
        commissionRate,
        commissionAmount,
        payoutAmount,
        description,
        selectedDate: new Date(selectedDate),
        selectedTime,
        capacity: capacity ? parseInt(capacity) : 4,
        maxPassengers: capacity ? parseInt(capacity) : 4,
        imageUrl: req.file.path,
        type,
        status: status || "SCHEDULED",
        driverId: driverId ? parseInt(driverId) : null,
        // Store lat/lng directly since Prisma doesn't support GeoJSON natively
        distance: null,
        duration: null,
      },
    });

    return res.json({
      success: true,
      message: "Ride added successfully",
      ride,
    });
  } catch (error) {
    console.error("Error in addRide:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
};

/**
 * GET /api/rides
 * List all rides (unprotected)
 */
const listRide = async (req, res) => {
  try {
    const rides = await prisma.ride.findMany({
      include: {
        driver: {
          select: { id: true, name: true, email: true, avatar: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json({ success: true, data: rides });
  } catch (error) {
    console.error("Error listing rides:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error fetching rides" });
  }
};

/**
 * DELETE /api/rides/:id
 * Remove a ride (admin only)
 */
const removeRide = async (req, res) => {
  try {
    const { id } = req.params;

    // Verify admin
    const admin = await prisma.adminProfile.findUnique({
      where: { userId: req.admin.id },
      include: { user: true },
    });

    if (!admin) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized" });
    }

    const deleted = await prisma.ride.delete({
      where: { id: parseInt(id) },
    });

    return res.json({ success: true, message: "Ride removed", deleted });
  } catch (error) {
    console.error("Error removing ride:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
};

/**
 * GET /api/rides/search
 * Search rides by pickup, destination, date, and passengers
 */
const rideSearch = async (req, res) => {
  try {
    const { pickup, destination, selectedDate, passengers } = req.query;

    if (!pickup || !destination || !selectedDate || !passengers) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    // Convert selectedDate to full-day range
    const searchDate = new Date(selectedDate);
    const startOfDay = new Date(searchDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(searchDate.setHours(23, 59, 59, 999));

    // Perform Prisma search
    const rides = await prisma.ride.findMany({
      where: {
        pickupNorm: { contains: pickup.toLowerCase() },
        destinationNorm: { contains: destination.toLowerCase() },
        selectedDate: { gte: startOfDay, lte: endOfDay },
        maxPassengers: { gte: parseInt(passengers) },
        status: { not: "CANCELLED" },
      },
      include: {
        driver: {
          select: { id: true, name: true, email: true, avatar: true },
        },
      },
      orderBy: { selectedDate: "asc" },
    });

    if (!rides.length) {
      return res
        .status(404)
        .json({ success: false, message: "No rides found" });
    }

    return res.json({ success: true, data: rides });
  } catch (error) {
    console.error("Error searching rides:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error" });
  }
};

// Add driver (Admin endpoint)
const addDriver = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      phone,
      licenseNumber,
      vehicleType,
      model,
      registrationNumber,
      capacity,
    } = req.body;

    // 1️⃣ Validate input
    if (
      !name ||
      !email ||
      !password ||
      !phone ||
      !licenseNumber ||
      !vehicleType ||
      !model ||
      !registrationNumber ||
      !capacity
    ) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    const avatar = req.file?.path || null;

    // 2️⃣ Check if user already exists
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      // 🆕 Create new user with DRIVER role
      user = await prisma.user.create({
        data: {
          name,
          email,
          password, // assume bcrypt hashing middleware in signup flow
          avatar,
          verified: true,
          roleAssignments: {
            create: {
              role: "DRIVER",
            },
          },
        },
        include: {
          roleAssignments: true,
        },
      });
    } else {
      // 🔄 Existing user: ensure they have DRIVER role
      const hasDriverRole = await prisma.userRoleAssignment.findFirst({
        where: { userId: user.id, role: "DRIVER" },
      });

      if (!hasDriverRole) {
        await prisma.userRoleAssignment.create({
          data: { userId: user.id, role: "DRIVER" },
        });
      }

      // Optional: update missing data
      await prisma.user.update({
        where: { id: user.id },
        data: {
          password: user.password ? undefined : password,
          avatar: user.avatar || avatar,
        },
      });
    }

    // 3️⃣ Prevent duplicate driver profile
    const existingProfile = await prisma.driverProfile.findUnique({
      where: { userId: user.id },
    });
    if (existingProfile) {
      return res.status(400).json({
        success: false,
        message: "Driver profile already exists",
      });
    }

    // 4️⃣ Create driver profile
    const driverProfile = await prisma.driverProfile.create({
      data: {
        userId: user.id,
        phone,
        licenseNumber,
        vehicleType,
        model,
        registrationNumber,
        capacity: Number(capacity),
        status: "pending",
        approved: false,
      },
    });

    // 5️⃣ Respond success
    return res.status(201).json({
      success: true,
      message: "Driver added successfully",
      driver: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          roles: user.roleAssignments.map((r) => r.role),
        },
        profile: driverProfile,
      },
    });
  } catch (error) {
    console.error("❌ Error adding driver:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const updateRideDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    // Handle uploaded image (if any)
    if (req.file) {
      updateData.imageUrl = req.file.path;
    }

    // Convert date if provided
    if (updateData.selectedDate) {
      updateData.selectedDate = new Date(updateData.selectedDate);
    }

    // Update ride
    const updatedRide = await prisma.ride.update({
      where: { id: Number(id) },
      data: updateData,
    });

    if (!updatedRide) {
      return res.status(404).json({ success: false, message: "Ride not found." });
    }

    return res.json({
      success: true,
      message: "Ride updated successfully.",
      ride: updatedRide,
    });
  } catch (error) {
    console.error("Error updating ride:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

const updateDriverDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const driverId = Number(id);
    if (isNaN(driverId)) {
      return res.status(400).json({ success: false, message: "Invalid driver ID." });
    }

    // --- 1️⃣ Update User ---
    const userUpdates = {};
    ["name", "email"].forEach((f) => {
      if (req.body[f]) userUpdates[f] = req.body[f];
    });
    if (req.file) userUpdates.avatar = req.file.path;

    const updatedUser = await prisma.user.update({
      where: { id: driverId },
      data: userUpdates,
    });

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    // --- 2️⃣ Update DriverProfile ---
    const profileUpdates = {};
    ["phone", "licenseNumber", "capacity"].forEach((f) => {
      if (req.body[f] !== undefined) profileUpdates[f] = req.body[f];
    });

    // Vehicle-related fields (flattened)
    if (
      req.body.vehicleType ||
      req.body.model ||
      req.body.registrationNumber
    ) {
      if (req.body.vehicleType) profileUpdates.vehicleType = req.body.vehicleType;
      if (req.body.model) profileUpdates.model = req.body.model;
      if (req.body.registrationNumber)
        profileUpdates.registrationNumber = req.body.registrationNumber;
      if (req.body.capacity)
        profileUpdates.capacity = Number(req.body.capacity);
    }

    const updatedProfile = await prisma.driverProfile.update({
      where: { userId: driverId },
      data: profileUpdates,
    });

    if (!updatedProfile) {
      return res.status(404).json({
        success: false,
        message: "Driver profile not found.",
      });
    }

      const log = await logActivity({
      userId: req.user.id,
      role: req.user.roleAssignments.map((r) => r.role).join(", "),
      action: "UPDATE_DRIVER",
      description: `Driver updated by ${req.user.email}`,
      req,
    });
      const io = req.app.get("io");
    if (io && log) {
      io.emit("new_activity_log", log);
    }
    // --- 3️⃣ Combine response ---
    return res.json({
      success: true,
      message: "Driver updated successfully.",
      driver: {
        ...updatedUser,
        profile: updatedProfile,
      },
    });
  } catch (err) {
    console.error("Error updating driver:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

const setup2FA = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.preAdminId },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "Admin not found." });
    }

    // Find or create admin profile
    let admin = await prisma.adminProfile.findUnique({
      where: { userId: user.id },
    });

    if (!admin) {
      admin = await prisma.adminProfile.create({
        data: { userId: user.id },
      });
    }

    // Generate new 2FA secret if not already set
    if (!admin.twoFASecret) {
      const newSecret = speakeasy.generateSecret({
        length: 20,
        name: `GoOn (${user.email})`,
      });

      admin = await prisma.adminProfile.update({
        where: { userId: user.id },
        data: { twoFASecret: newSecret.base32 },
      });
    }

    // Build otpauth URL for QR code
    const otpauthURL = speakeasy.otpauthURL({
      secret: admin.twoFASecret,
      label: encodeURIComponent(`GoOn Admin:${user.email}`),
      issuer: "GoOn",
      algorithm: "sha1",
      digits: 6,
      period: 60,
      encoding: "base32",
    });

    const qrDataURL = await qrcode.toDataURL(otpauthURL);

// If no backup codes exist, generate and save them
if (!admin.backupCodes || admin.backupCodes.length === 0) {
  const { plainCodes, codes } = await generateBackupCodes();

  await prisma.adminProfile.update({
    where: { userId: user.id },
    data: {
      backupCodes: {
        create: codes, // ✅ Nested create
      },
      backupCodesGeneratedAt: new Date(),
    },
  });

      const log = await logActivity({
      userId: req.user?.id,
      role: req.user ? req.user.roleAssignments.map((r) => r.role).join(", ") : "SYSTEM",
      action: "SETUP_2FA",
      description: `Generated 2FA setup for admin ${req.user?.email}`,
      req,
    });
      const io = req.app.get("io");
    if (io && log) {
      io.emit("new_activity_log", log);
    }

  return res.status(200).json({
    success: true,
    qrDataURL,
    backupCodes: plainCodes,
  });
}

    return res.status(200).json({ success: true, qrDataURL });
  } catch (err) {
    logger.error("generate2FAQr error:", err);
      const log = await logActivity({
      userId: req.user?.id,
      role: req.user ? req.user.roleAssignments.map((r) => r.role).join(", ") : "SYSTEM",
      action: "🔴SETUP_2FA_FAILED",
      description: `Error generating 2FA setup for admin ${req.user?.email}`,
      req,
    });
      const io = req.app.get("io");
    if (io && log) {
      io.emit("new_activity_log", log);
    }
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

const verify2FA = async (req, res) => {
  const { totpCode } = req.body;
  if (!totpCode) {
    return res.status(400).json({ success: false, message: "Missing TOTP code." });
  }

  try {
    // 1️⃣ Find admin user and profile
    const user = await prisma.user.findUnique({
      where: { id: req.preAdminId },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "Admin not found." });
    }

    const admin = await prisma.adminProfile.findUnique({
      where: { userId: user.id },
      select: {
        twoFASecret: true,
        failedLoginAttempts: true,
        lockUntil: true,
        isDisabled: true,
        is2FAVerified: true,
      },
    });

    if (!admin) {
      return res.status(404).json({ success: false, message: "Admin profile not found." });
    }

    // 2️⃣ Check account status
    if (admin.isDisabled) {
      return res.status(403).json({ success: false, message: "Account disabled." });
    }

    if (admin.lockUntil && new Date(admin.lockUntil) > new Date()) {
      const unlockTime = new Date(admin.lockUntil).toLocaleString();
      return res.status(423).json({
        success: false,
        message: `Account locked until ${unlockTime}.`,
      });
    }

    if (!admin.twoFASecret) {
      return res
        .status(400)
        .json({ success: false, message: "2FA not set up for this account." });
    }

    // 3️⃣ Verify 2FA code
    const verified = speakeasy.totp.verify({
      secret: admin.twoFASecret,
      encoding: "base32",
      token: totpCode,
      window: 1,
    });

    if (!verified) {
      return res.status(401).json({ success: false, message: "Invalid 2FA code." });
    }

    // 4️⃣ Mark 2FA as verified if not already
    if (!admin.is2FAVerified) {
      await prisma.adminProfile.update({
        where: { userId: user.id },
        data: { is2FAVerified: true },
      });
    }

    // 5️⃣ Generate tokens
    const accessToken = signAccessToken(user);
    const refreshTokenRaw = signRefreshToken(user);
    const hashed = await bcrypt.hash(refreshTokenRaw, 10);

    // Ensure array exists
    const existingTokens = Array.isArray(user.refreshTokens)
      ? user.refreshTokens
      : [];

    await prisma.user.update({
      where: { id: user.id },
      data: {
        refreshTokens: {
          set: [
            ...existingTokens,
            {
              token: hashed,
              createdAt: new Date(),
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              revoked: false,
            },
          ],
        },
      },
    });

    // 6️⃣ Set cookies for admin path
    setAppCookie(res, "adminRefreshToken", refreshTokenRaw, {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/api/admin",
    });

    setAppCookie(res, "adminAccessToken", accessToken, {
      maxAge: 15 * 60 * 1000,
      path: "/api/admin",
    });

      const log = await logActivity({
      userId: req.user?.id,
      role: req.user ? req.user.roleAssignments.map((r) => r.role).join(", ") : "SYSTEM",
      action: "VERIFY_2FA",
      description: `Admin 2FA verified for ${req.user.email}`,
      req,
    });
      const io = req.app.get("io");
    if (io && log) {
      io.emit("new_activity_log", log);
    }

    return res.status(200).json({
      success: true,
      message: "2FA verification successful.",
      roles: user.roles,
    });
  } catch (err) {
    console.error("verify2FA error:", err);
      const log = await logActivity({
      userId: req.user?.id,
      role: req.user ? req.user.roleAssignments.map((r) => r.role).join(", ") : "SYSTEM",
      action: "🔴VERIFY_2FA_FAILED",
      description: `Error during admin 2FA verification for ${req.user?.email}`,
      req,
    });
      const io = req.app.get("io");
    if (io && log) {
      io.emit("new_activity_log", log);
    }
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

const adminTokenRefresh = async (req, res) => {
  const refreshToken = req.cookies.adminRefreshToken;
  if (!refreshToken)
    return res.status(401).json({ message: "No refresh token." });

  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    const userId = decoded.id;

    // Fetch user + roles + refresh tokens + admin profile
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        refreshTokens: true,
        roleAssignments: true,
        adminProfile: true,
      },
    });

    if (!user) {
      return res.status(401).json({ message: "User not found." });
    }

    const allowedRoles = ["ADMIN", "SUPER_ADMIN", "ADMIN_MANAGER"];
    const userRoles = user.roleAssignments.map((r) => r.role);

    if (!userRoles.some((role) => allowedRoles.includes(role))) {
      return res.status(403).json({ message: "Not authorized as admin." });
    }

    if (!user.adminProfile) {
      return res.status(401).json({ message: "Admin profile not found." });
    }

    // Validate refresh token in DB
    const validRefresh = await prisma.refreshToken.findFirst({
      where: {
        userId,
        revoked: false,
        expiresAt: { gt: new Date() },
      },
    });

    let valid = false;
    if (validRefresh && (await bcrypt.compare(refreshToken, validRefresh.token))) {
      valid = true;
    }

    if (!valid) {
      return res
        .status(401)
        .json({ code: "REFRESH_INVALID", message: "Invalid or expired refresh token." });
    }

    // Generate new tokens
    const newAccessToken = signAccessToken(user);
    const newRefreshRaw = signRefreshToken(user);
    const newHashed = await bcrypt.hash(newRefreshRaw, 10);

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Use transaction to revoke old tokens + insert new one
    await prisma.$transaction(async (tx) => {
      await tx.refreshToken.updateMany({
        where: { userId, revoked: false },
        data: { revoked: true },
      });

      await tx.refreshToken.create({
        data: {
          userId,
          token: newHashed,
          expiresAt,
          revoked: false,
        },
      });
    });

    // Update cookies
    setAppCookie(res, "adminRefreshToken", newRefreshRaw, {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/api/admin",
    });
    setAppCookie(res, "adminAccessToken", newAccessToken, {
      maxAge: 15 * 60 * 1000,
      path: "/api/admin",
    });

    return res.json({
      success: true,
      roles: userRoles,
      message: "Token refreshed successfully.",
    });
  } catch (err) {
    if (err.name === "TokenExpiredError" || err.name === "JsonWebTokenError") {
      return res.status(403).json({ code: "JWT_INVALID", message: "Invalid refresh token." });
    }
    logger.error("Refresh token internal error", err);
    return res
      .status(500)
      .json({ code: "REFRESH_INTERNAL", message: "Server error during refresh." });
  }
};

const adminLogout = async (req, res) => {
  const refreshToken = req.cookies?.adminRefreshToken;

  if (refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);

      // Find user with refresh tokens
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        include: { refreshTokens: true },
      });

      if (user && user.refreshTokens?.length) {
        for (const rt of user.refreshTokens) {
          if (rt.revoked) continue;

          const match = await bcrypt.compare(refreshToken, rt.token);
          if (match) {
            // Mark the token as revoked
            await prisma.refreshToken.update({
              where: { id: rt.id },
              data: { revoked: true },
            });
            break;
          }
        }
      }
    } catch (err) {
      console.warn("Logout: token verify/revoke failed (continuing):", err.message);
    }
  }

  // Clear cookies regardless of token status
  clearMultipleCookies(res, ["adminAccessToken", "adminRefreshToken"],{
    path: "/api/admin",
  });

      const log = await logActivity({
      userId: req.user.id,
      role: req.user.roleAssignments.map((r) => r.role).join(", "),
      action: "🟧ADMIN_LOGOUT",
      description: `Admin ${req.user.email} logged out.`,
      req,
    });
      const io = req.app.get("io");
    if (io && log) {
      io.emit("new_activity_log", log);
    }
  return res.status(200).json({ success: true, message: "Logged out." });
};

/**
 * @desc Publishes or schedules a global update notification.
 * @route POST /api/admin/global-update
 */
const publishGlobalUpdate = async (req, res) => {
   const schema = Joi.object({
     title: Joi.string().required(),
     body: Joi.string().required(),
     url: Joi.string().uri().optional(),
     imageUrl: Joi.string().uri().optional(),
     sendAt: Joi.date().iso().min('now').optional().allow(null), 
   });
   const { error } = schema.validate(req.body);
   if (error) {
     logger.warn(`Admin global update validation error: ${error.details.map(x => x.message).join(', ')}`);
     return res.status(400).json({ success: false, message: error.details[0].message });
   }

  const { title, body, url, imageUrl, sendAt } = req.body;

  if (!title || !body) {
    logger.warn('Admin global update request missing title or body.');
    return res.status(400).json({ success: false, message: 'Missing title or body.' });
  }

  let scheduledSendDate = null;
  if (sendAt) {
    scheduledSendDate = new Date(sendAt);
    if (isNaN(scheduledSendDate.getTime()) || scheduledSendDate.getTime() < Date.now()) {
      logger.warn(`Admin global update request received invalid or past 'sendAt' date: ${sendAt}`);
      return res.status(400).json({ success: false, message: 'Invalid or past "sendAt" date provided. Must be a valid future ISO date string.' });
    }
  }

  const data = { url, imageUrl, type: 'global-update' };
  const topic = 'global-updates';

  const delay = scheduledSendDate ? Math.max(0, scheduledSendDate.getTime() - Date.now()) : 0;

  try {
    const jobName = 'global-update';
    const jobOptions = {
      delay: delay,
      jobId: `global-update-${Date.now()}` 
    };

    const job = await notificationQueue.add(
      jobName,
      { title, body, data, topic, scheduledAt: scheduledSendDate || new Date() },
      jobOptions
    );

    logger.info(`Global update job '${job.id}' added to queue. Scheduled for: ${scheduledSendDate ? scheduledSendDate.toISOString() : 'immediate'}.`);
    res.json({
      success: true,
      message: scheduledSendDate
        ? `Global update scheduled for ${scheduledSendDate.toISOString()}.`
        : 'Global update published immediately.',
      jobId: job.id,
    });
  } catch (err) {
    logger.error('❌ publishGlobalUpdate error when adding job to queue:', {
      message: err.message,
      stack: err.stack,
      requestBody: req.body,
    });
    res.status(500).json({ success: false, message: 'Failed to schedule global update: ' + err.message });
  }
};

const publishDivers = async (req, res) => {
   const schema = Joi.object({
     title: Joi.string().required(),
     body: Joi.string().required(),
     url: Joi.string().uri().optional(),
     imageUrl: Joi.string().uri().optional(),
     sendAt: Joi.date().iso().min('now').optional().allow(null), 
   });
   const { error } = schema.validate(req.body);
   if (error) {
     logger.warn(`Admin global update validation error: ${error.details.map(x => x.message).join(', ')}`);
     return res.status(400).json({ success: false, message: error.details[0].message });
   }

  const { title, body, url, imageUrl, sendAt } = req.body;

  if (!title || !body) {
    logger.warn('Admin global update request missing title or body.');
    return res.status(400).json({ success: false, message: 'Missing title or body.' });
  }

  let scheduledSendDate = null;
  if (sendAt) {
    scheduledSendDate = new Date(sendAt);
    if (isNaN(scheduledSendDate.getTime()) || scheduledSendDate.getTime() < Date.now()) {
      logger.warn(`push to drivers update request received invalid or past 'sendAt' date: ${sendAt}`);
      return res.status(400).json({ success: false, message: 'Invalid or past "sendAt" date provided. Must be a valid future ISO date string.' });
    }
  }

  const data = { url, imageUrl, type: 'push-to-drivers' };
  const topic = 'push-to-drivers'; 

  const delay = scheduledSendDate ? Math.max(0, scheduledSendDate.getTime() - Date.now()) : 0;

  try {
    const jobName = 'push-to-drivers';
    const jobOptions = {
      delay: delay,
      jobId: `push-to-drivers-${Date.now()}` 
    };

    const job = await notificationQueue.add(
      jobName,
      { title, body, data, topic, scheduledAt: scheduledSendDate || new Date() }, // Store actual scheduled date
      jobOptions
    );

    logger.info(`push to drivers job '${job.id}' added to queue. Scheduled for: ${scheduledSendDate ? scheduledSendDate.toISOString() : 'immediate'}.`);
    res.json({
      success: true,
      message: scheduledSendDate
        ? `Push to drivers scheduled for ${scheduledSendDate.toISOString()}.`
        : 'Push to drivers published immediately.',
      jobId: job.id,
    });
  } catch (err) {
    logger.error('❌ Push to drivers error when adding job to queue:', {
      message: err.message,
      stack: err.stack,
      requestBody: req.body,
    });
    res.status(500).json({ success: false, message: 'Failed to schedule global update: ' + err.message });
  }
};


const verifyRecaptchaHold = async (req, res) => {
  const { holdDuration, startedAt } = req.body;
  const now = Date.now();
  const heldTime = now - startedAt;

  if (!startedAt || !holdDuration || heldTime < 2000) {
    return res.status(400).json({ 
      success: false, 
      message: "CAPTCHA not held long enough." 
    });
  }

  if (heldTime > 10000) { 
    return res.status(400).json({ 
      success: false, 
      message: "Invalid hold duration." 
    });
  }

  try {
    const jti = crypto.randomUUID();
    
    const clientIP = req.headers["x-forwarded-for"]?.split(',')[0]?.trim() || 
                    req.connection.remoteAddress || 
                    req.socket.remoteAddress || 
                    req.ip;

    const captchaToken = jwt.sign(
      { 
        passed: true, 
        jti, 
        ip: clientIP,
        timestamp: now
      },
      process.env.CAPTCHA_SECRET,
      { expiresIn: "3m" }
    );

    const jtiKey = `security:captcha:jti:${jti}`;
    await redis.set(jtiKey, 'valid', 'EX', 180); 

    // Set the cookie
    res.cookie("admin_captcha", captchaToken, {
      httpOnly: true,
      secure: true,
      sameSite: "None",
      maxAge: 3 * 60 * 1000, // 3 minutes
      path: "/api/admin",
    });

      const log = await logActivity({
      userId: req.user?.id || null,
      role: req.user
        ? req.user.roleAssignments.map((r) => r.role).join(", ")
        : "SYSTEM",
      action: "ADMIN_CAPTCHA_VERIFIED",
      description: req.user
        ? `Admin ${req.user.email} passed CAPTCHA verification.`
        : `Anonymous client from ${clientIP} passed CAPTCHA verification.`,
      req,
    });
      const io = req.app.get("io");
    if (io && log) {
      io.emit("new_activity_log", log);
    }

    res.status(200).json({ 
      success: true, 
      message: "CAPTCHA verified." 
    });

  } catch (error) {
    console.error('CAPTCHA verification error:', error);
    const log = await logActivity({
      userId: req.user?.id || null,
      role: req.user
        ? req.user.roleAssignments.map((r) => r.role).join(", ")
        : "SYSTEM",
      action: "🔴 ADMIN_CAPTCHA_FAILED",
      description: req.user
        ? `Admin ${req.user.email} failed CAPTCHA verification.`
        : `Anonymous client CAPTCHA verification failed. Error: ${error.message}`,
      req,
    });
      const io = req.app.get("io");
    if (io && log) {
      io.emit("new_activity_log", log);
    }
    res.status(500).json({ 
      success: false, 
      message: "CAPTCHA verification failed." 
    });
  }
};

export { 
  createAdmin,
  adminLogin,
  getAdminProfile, 
  deleteAdminProfile,
  adminTokenRefresh,
  adminLogout,
  changePassword,
  forgotPassword, 
  resetPassword, 
  getDashboardStats, 
  getMonthlyRevenue, 
  getBookingStatusDistribution, 
  getMonthlyBookings,
  getAllRides, 
  getRideById, 
  getDriverById,
  assignRideToDriver, 
  updateRideStatus, 
  getAllDrivers,
  approveDriver,
  getAllBookings,
  addRide,
  listRide,
  removeRide, 
  rideSearch,
  addDriver,
  updateRideDetails,
  updateDriverDetails,
  verifyRecaptchaHold,
  setup2FA,
  verify2FA,
  getCommissionRate,
  setCommissionRate,
  updateAdminAvatar,
  publishGlobalUpdate,
  publishDivers,
};
