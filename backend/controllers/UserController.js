import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import validator from "validator";
import { generateOTP } from "../utils/generateOTP.js";
import { sendEmail } from "../utils/sendEmail.js";
import {
  EmailOTP,
  EmailWelcome,
  ResendEmail,
  VerifiedEmail,
} from "../utils/EmailTemplates.js";
import { sendPushNotification, subscribeTokenToTopic } from "../utils/pushNotification.js";
import crypto from "crypto";
import dotenv from "dotenv";
import { clearMultipleCookies, setAppCookie } from "../utils/CookieHelper.js";
import logger from "../middlewares/logger.js";
import prisma from "../config/Db.js";
import { logActivity } from "../utils/logActivity.js";

dotenv.config();

// Helper token functions
const signAccessToken = (user) =>
  jwt.sign({ id: user.id, roles: user.roles }, process.env.JWT_SECRET, {
    expiresIn: "15m",
  });

const signRefreshToken = (user) =>
  jwt.sign({ id: user.id }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: "7d",
  });

const registerUser = async (req, res) => {
  const { name, password, email, googleId, fcmToken } = req.body;

  try {
    // 🔹 Validate email & password
    if (!validator.isEmail(email)) {
      return res.status(400).json({ success: false, message: "Invalid email format" });
    }

    if (!validator.isStrongPassword(password)) {
      return res.status(403).json({
        success: false,
        message:
          "Password must be at least 8 characters long and include uppercase, lowercase, and a special character.",
      });
    }

    // 🔹 Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({ success: false, message: "User already exists" });
    }

    // 🔹 Hash password and create user
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        verified: false,
        googleId: googleId || null,
        fcmToken: fcmToken || null,
      },
    });

    // 🔹 Assign default role USER
    await prisma.userRoleAssignment.create({
      data: {
        userId: user.id,
        role: "USER",
      },
    });

    // 🔹 Generate OTP and save to DB
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.oTP.create({
      data: {
        userId: user.id,
        otp,
        expiresAt,
      },
    });

    // 🔹 Send email verification
    await sendEmail(user.email, "Email Verification 🚌", EmailOTP(user.name, otp));

    // 🔹 Optional: Push notification
    if (user.fcmToken) {
      try {
        await sendPushNotification(user.fcmToken, {
          title: `Welcome, ${user.name}!`,
          body: "You have successfully registered in TOLI-TOLI. Check your dashboard for more updates 😊",
          data: {
            type: "register",
            tag: "register",
            url: "/myBookings",
          },
        });

        await subscribeTokenToTopic(user.fcmToken);
      } catch (pushErr) {
        logger.error("Push notification failed:", pushErr.code || pushErr.message);
      }
    }

          const log = await logActivity({
            userId:user.id,
            action: "REGISTERED SUCCESSFULLY",
            description: `${user.name} registered in successfully`,
            ipAddress: req.ip,
            userAgent: req.get("User-Agent"),
          });
            const io = req.app.get("io");
          if (io && log) {
            io.emit("new_activity_log", log);
          }
    // 🔹 Respond success
    return res.status(200).json({
      success: true,
      message: "OTP sent to your email",
      redirect: "/verify-otp",
      userId: user.id,
    });
  } catch (error) {
    logger.error("Register error:", error);
    return res.status(500).json({ success: false, message: "Server is down. Please try again later" });
  }
};

const loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    // 🔹 Find user
    const user = await prisma.user.findUnique({
      where: { email },
      include: { refreshTokens: true },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No account found with this email. Please register first.",
      });
    }
    const userId = user.id; 

    if (!user.verified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email to continue.",
        redirect: "/verify-otp",
      });
    }

    if (!user.password) {
      return res.status(400).json({
        success: false,
        message: "Use Google login for this account.",
      });
    }

    // 🔹 Account lock check
    if (user.lockUntil && user.lockUntil > new Date()) {
      return res.status(423).json({
        success: false,
        message:
          "⚠️ Account is temporarily locked due to too many failed attempts. Try again later.",
      });
    }

    // 🔹 Password validation
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      const failedAttempts = (user.failedLoginAttempts || 0) + 1;
      let lockUntil = null;

      if (failedAttempts >= 5) {
        lockUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 min
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: failedAttempts,
          lockUntil,
        },
      });

      return res.status(lockUntil ? 423 : 401).json({
        success: false,
        message: lockUntil
          ? "Account locked due to too many failed attempts."
          : "Incorrect credentials.",
      });
    }

    // 🔹 Reset failed login attempts
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockUntil: null,
      },
    });

    // 🔹 Generate tokens
    const accessToken = signAccessToken(user);
    const refreshTokenRaw = signRefreshToken(user);
    const hashedRefreshToken = await bcrypt.hash(refreshTokenRaw, 10);

    // 🔹 Clean up old refresh tokens and save new one
    const validTokens = user.refreshTokens
      .filter(
        (rt) => !rt.revoked && (!rt.expiresAt || rt.expiresAt > new Date())
      )
      .slice(-4);

    await prisma.refreshToken.create({
      data: {
        token: hashedRefreshToken,
        userId: user.id,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        revoked: false,
      },
    });

    // 🔹 Email notification
    await sendEmail(user.email, "Welcome Back 🚌", EmailWelcome(user.name));

    // 🔹 Create notification
    await prisma.notification.create({
      data: {
        userId: user.id,
        title: `Welcome back, ${user.name}!`,
        body: "You have successfully logged in to GoOn. Check your dashboard for updates 😊",
        type: "LOGIN",
        isRead: false,
      },
    });

    // 🔹 Optional push notification
    if (user.fcmToken) {
      try {
        await sendPushNotification(user.fcmToken, {
          title: `Welcome back, ${user.name}!`,
          body: "You have successfully logged in to GoOn. Check your dashboard for updates 😊",
          data: { type: "login", tag: "login", url: "/myBookings" },
        });

        await subscribeTokenToTopic(user.fcmToken);
      } catch (pushErr) {
        logger.warn("Login push failed:", pushErr.code || pushErr.message);
      }
    }

    // 🔹 Set cookies
    setAppCookie(res, "userRefreshToken", refreshTokenRaw, {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    });
    setAppCookie(res, "userAccessToken", accessToken, {
      maxAge: 15 * 60 * 1000,
      path: "/",
    });

            const log = await logActivity({
            userId:user.id,
            action: "LOGIN SUCCESSFULLY",
            description: `${user.name} logged in successfully`,
            req,
          });
            const io = req.app.get("io");
          if (io && log) {
            io.emit("new_activity_log", log);
          }
      
    // 🔹 Final response
    return res.json({
      success: true,
      roles: user.roles,
      userId: user.id.toString(),
      message: "Login successful!",
    });
  } catch (err) {
    logger.error("Error in loginUser:", {
      message: err.message,
      stack: err.stack,
    });
    return res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again.",
    });
  }
};

const forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({
      where: { email },
      data: {
        resetToken,
        resetTokenExpires,
      },
    });

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    await sendEmail(
      user.email,
      "Reset Your Password",
      `Click the link below to reset your password:\n\n${resetUrl}\n\nThis link will expire in 1 hour.`
    );

    res.json({
      success: true,
      message: "Password reset link sent to your email.",
    });
  } catch (err) {
    logger.error("Forgot password error:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
};

const resetPassword = async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  try {
    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpires: { gt: new Date() },
      },
    });

    if (!user) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired token." });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpires: null,
      },
    });

    res.json({ success: true, message: "Password reset successful✅." });
  } catch (err) {
    logger.error("Reset password error:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
};

const verifyOTP = async (req, res) => {
  try {
    const { userId, otp, token } = req.body;
    console.log("Incoming verifyOTP payload:", req.body);

   let userIdNumber = null;

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      userIdNumber = parseInt(decoded.id, 10);
    } else if (userId) {
      userIdNumber = parseInt(userId, 10);
    }

    if (!userIdNumber || Number.isNaN(userIdNumber)) {
      console.warn("Invalid or missing userId:", userId);
      return res.json({ success: false, message: "Invalid user ID or missing data" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userIdNumber },
    });

    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    let otpRecord = null;
    if (!token) {
      otpRecord = await prisma.OTP.findFirst({
        where: {
          userId: user.id,
          otp,
          expiresAt: { gte: new Date() },
        },
      });

      if (!otpRecord) {
        return res.json({ success: false, message: "Invalid or expired OTP" });
      }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { verified: true },
    });

    await prisma.OTP.deleteMany({ where: { userId: user.id } });

    await sendEmail(user.email, "Successful Verification 🚌", VerifiedEmail(user.name));

    const redirectUrl = `${process.env.FRONTEND_URL}/?name=${encodeURIComponent(user.name)}&email=${encodeURIComponent(user.email)}`;

    const accessToken = signAccessToken(user);
    const refreshTokenRaw = signRefreshToken(user);
    setAppCookie(res, "userAccessToken", accessToken, {
      maxAge: 15 * 60 * 1000,
      path: "/",
    });

    setAppCookie(res, "userRefreshToken", refreshTokenRaw, {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    });

        const log = await logActivity({
            userId:user.id,
            action: "VERIFIED SUCCESSFULLY",
            description: `${user.name} verified in successfully`,
            req,
            email: user.email,
          });
            const io = req.app.get("io");
          if (io && log) {
            io.emit("new_activity_log", log);
          }

    return res.json({
      success: true,
      message: "Email verified successfully",
      redirect: redirectUrl,
      token: signAccessToken(user),
      user: { name: user.name, email: user.email },
    });
  } catch (error) {
    logger.error("OTP verification error:", error);
    return res.json({ success: false, message: "Network unstable" });
  }
};

const resendOTP = async (req, res) => {
  const { userId } = req.body;

    if (!userId) {
    return res.json({ success: false, message: "User ID is missing" });
  }

  try {
      const user = await prisma.user.findUnique({ where: { id: Number(userId) } });

    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    if (user.verified) {
      return res.json({ success: false, message: "User already verified" });
    }

    const otp = generateOTP();
    const token = signAccessToken(user);
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-otp?token=${token}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    // 📨 Send OTP email
    await sendEmail(
      user.email,
      "Email Verification 🚌",
      ResendEmail(user.name, otp, verificationUrl)
    );

    // 🔄 Upsert OTP (update if exists, else create)
    await prisma.oTP.upsert({
      where: { userId: user.id },
      update: { otp, expiresAt },
      create: { userId: user.id, otp, expiresAt },
    });

    res.json({ success: true, message: "OTP resent successfully" });
  } catch (error) {
    logger.error("Resend OTP error:", error);
    res.json({ success: false, message: "Network unstable" });
  }
};

const googleAuthCallback = async (req, res) => {
  try {
    console.log("Google Profile Data:", req.user);

    if (!req.user) {
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=google_auth_failed`);
    }

    const { id: googleId, displayName, emails, photos } = req.user;
    const email = emails?.[0]?.value || null;
    const name = displayName || "Google User";
    const avatar = photos?.[0]?.value || "";

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Required user information (email) is missing",
      });
    }

    // 🧩 Find or create user in Prisma
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          name,
          email,
          avatar,
          googleId,
          verified: true,
          refreshTokens: [],
        },
      });
    }

    // 🛠️ Generate tokens
    const accessToken = signAccessToken(user);
    const refreshTokenRaw = signRefreshToken(user);
    const hashedToken = await bcrypt.hash(refreshTokenRaw, 10);

    // 🧹 Keep last 5 valid refresh tokens
    const validTokens = (user.refreshTokens || []).filter(
      (rt) => !rt.revoked && (!rt.expiresAt || new Date(rt.expiresAt) > new Date())
    );

    const newTokens = [
      ...validTokens.slice(-4),
      {
        token: hashedToken,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        revoked: false,
      },
    ];

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshTokens: newTokens },
    });

    // 🍪 Set cookies
    setAppCookie(res, "userRefreshToken", refreshTokenRaw, {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    });
    setAppCookie(res, "userAccessToken", accessToken, {
      maxAge: 15 * 60 * 1000,
      path: "/",
    });

    // 📧 Send welcome email
    await sendEmail(email, "Welcome Back 🚌", EmailWelcome(user.name));

    // 🌐 Redirect to frontend
    const redirectUrl = new URL(process.env.FRONTEND_URL);
    redirectUrl.pathname = "/";
    redirectUrl.searchParams.set("name", user.name);
    redirectUrl.searchParams.set("email", user.email);
    redirectUrl.searchParams.set("avatar", avatar);

    // 🔔 Push notification
    if (user.fcmToken) {
      const payload = {
        title: `Welcome back, ${user.name}!`,
        body: "You have successfully logged in into TOLI-TOLI. Check your dashboard for updates 😊",
        data: {
          type: "login",
          tag: "login",
          url: "/myBookings",
        },
      };
      try {
        await sendPushNotification(user.fcmToken, payload);
      } catch (pushErr) {
        logger.warn("Login push failed:", pushErr.code || pushErr.message);
      }
    } else {
      logger.info("No FCM token; skipping push notification.");
    }

    // 📜 Log notification event
    await prisma.notification.create({
      data: {
        userId: user.id,
        title: `Welcome back, ${user.name}!`,
        body: "You have successfully logged in into TOLI-TOLI.",
        type: "login",
        isRead: false,
      },
    });

    // ✅ Final redirect
    return res.redirect(redirectUrl.toString());
  } catch (error) {
    logger.error("Google auth callback error:", error);
    res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_error`);
  }
};

// Google login failure
const GOOGLE_API_KEY = process.env.GOOGLE_MAP_API;

/**
 * 🔴 Google Auth Failure Handler
 */
const googleAuthFailure = (req, res) => {
  const errorMsg = req.query.error || "Google authentication failed";
  logger.error("Google authentication failed:", errorMsg);

  // Send JSON and redirect (frontend will handle message)
  res.status(401).json({
    success: false,
    message: "Failed to authenticate with Google",
  });

  res.redirect(`${process.env.FRONTEND_URL}/?error=google_auth_failed`);
};

/**
 * 🌍 Google Places API Autocomplete
 */
const placesApi = async (req, res) => {
  const input = req.query.input;
  if (!input) {
    return res.status(400).json({ success: false, message: "Missing input query parameter" });
  }

  const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
    input
  )}&key=${GOOGLE_API_KEY}&types=geocode`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.error_message) {
      logger.warn("Google API error:", data.error_message);
      return res.status(502).json({
        success: false,
        message: "Google API error",
        details: data.error_message,
      });
    }

    res.status(200).json({
      success: true,
      predictions: data.predictions || [],
    });
  } catch (error) {
    logger.error("Failed to fetch data from Google Places API:", error);
    res.status(500).json({ success: false, message: "Server error contacting Google API" });
  }
};

const updateFCMToken = async (req, res) => {
  try {
    const { fcmToken } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      logger.warn("updateFCMToken: Missing user in request");
      return res.status(401).json({
        success: false,
        message: "Unauthorized: missing user context.",
      });
    }

    if (!fcmToken) {
      return res.status(400).json({
        success: false,
        message: "FCM token is required.",
      });
    }

    // Remove token from any other user first (avoid unique constraint error)
    await removeTokenFromDatabase(fcmToken);

    // Update user's FCM token
    const user = await prisma.user.update({
      where: { id: Number(userId) },
      data: { fcmToken },
    });

    // Subscribe token to topic for broadcast
    await subscribeTokenToTopic(fcmToken, "global-updates");

    return res.status(200).json({
      success: true,
      message: "FCM token updated successfully.",
      user,
    });
  } catch (error) {
    logger.error("Error updating FCM token:", error);

    // Handle unique constraint violation gracefully
    if (error.code === "P2002" && error.meta?.target?.includes("fcmToken")) {
      return res.status(409).json({
        success: false,
        message: "This FCM token is already registered to another account.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error while updating FCM token.",
    });
  }
};
/**
 * 🗑️ Delete FCM Token
 */
const deleteFCMToken = async (req, res) => {
  try {
    const { fcmToken } = req.body;
    const userId = req.user?.id;

    if (!fcmToken) {
      return res.status(400).json({
        success: false,
        message: "FCM token is required",
      });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { fcmToken: null },
    });

    return res.status(200).json({
      success: true,
      message: "FCM token removed successfully",
    });
  } catch (error) {
    logger.error("Error deleting FCM token:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while deleting FCM token",
    });
  }
};
// --- USER REFRESH TOKEN FLOW (Prisma) ---
const userTokenRefresh = async (req, res) => {
  const refreshToken = req.cookies?.userRefreshToken;
  if (!refreshToken) {
    return res.status(401).json({
      code: "NO_REFRESH",
      message: "No refresh token provided.",
    });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    const userId = decoded.id;

    // Get user + roles
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { roleAssignments: true },
    });

    if (
      !user ||
      !user.roleAssignments.some(r => r.role === "USER" || r.role === "DRIVER")
    ) {
      return res.status(403).json({
        code: "INVALID_USER",
        message: "User not found or role not allowed.",
      });
    }

    // Find all refresh tokens for this user
    const refreshTokens = await prisma.refreshToken.findMany({
      where: {
        userId: user.id,
        revoked: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "asc" },
    });

    // Validate current token
    let validToken = null;
    for (const rt of refreshTokens) {
      const match = await bcrypt.compare(refreshToken, rt.token);
      if (match) {
        validToken = rt;
        break;
      }
    }

    if (!validToken) {
      return res.status(401).json({
        code: "REFRESH_INVALID",
        message: "Invalid or expired refresh token.",
      });
    }

    // Generate new tokens
    const newAccessToken = signAccessToken(user);
    const newRefreshTokenRaw = signRefreshToken(user);
    const hashedNewRefresh = await bcrypt.hash(newRefreshTokenRaw, 10);

    // Create new refresh token record
    await prisma.refreshToken.create({
      data: {
        token: hashedNewRefresh,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        userId: user.id,
      },
    });

    // Keep only the last 4 refresh tokens
    const validIds = refreshTokens.map(rt => rt.id).slice(-3); // old 3 + new one = 4
    await prisma.refreshToken.deleteMany({
      where: {
        userId: user.id,
        id: { notIn: validIds },
      },
    });

    // Set new cookies
    setAppCookie(res, "userRefreshToken", newRefreshTokenRaw, {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: "/",
    });
    setAppCookie(res, "userAccessToken", newAccessToken, {
      maxAge: 15 * 60 * 1000, // 15 minutes
      path: "/",
    });

    return res.json({
      success: true,
      roles: user.roleAssignments.map(r => r.role),
      message: "Token refreshed successfully.",
    });
  } catch (err) {
    if (["TokenExpiredError", "JsonWebTokenError"].includes(err.name)) {
      return res.status(403).json({
        code: "JWT_INVALID",
        message: "Invalid or expired refresh token.",
      });
    }

    logger.error("User token refresh error:", err);
    return res.status(500).json({
      code: "REFRESH_INTERNAL",
      message: "Server error during token refresh.",
    });
  }
};

const userLogout = async (req, res) => {
  const refreshToken = req.cookies?.userRefreshToken;

  try {
    if (refreshToken) {
      let decoded;
      try {
        decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
      } catch (err) {
        logger.warn(`Invalid refresh token during logout: ${err.message}`);
      }

      if (decoded?.id) {
        const user = await prisma.user.findUnique({
          where: { id: decoded.id },
          include: { refreshTokens: true },
        });

        if (user?.refreshTokens?.length) {
          for (const rt of user.refreshTokens) {
            if (rt.revoked) continue;

            const isMatch = await bcrypt.compare(refreshToken, rt.token);
            if (isMatch) {
              await prisma.refreshToken.update({
                where: { id: rt.id },
                data: { revoked: true },
              });

              logger.info(`Refresh token revoked for user ID ${user.id}.`);
              break;
            }
          }
        }
      }
    }
  } catch (error) {
    logger.error("Error during user logout:", error);
  }

  // Always clear cookies
  clearMultipleCookies(res, ["userAccessToken", "userRefreshToken"]);

  return res.status(200).json({
    success: true,
    message: "User logged out successfully.",
  });
};

const getUserProfile = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        fcmToken: true,
        createdAt: true,
        updatedAt: true,
        roleAssignments: {
          select: { role: true },
        },
        verified: true,
      },
    });

    if (!user) {
      return res.status(403).json({
        success: false,
        code: "AUTH_INVALID",
        message: "Invalid or expired authentication state.",
      });
    }

    return res.json({
      success: true,
      user: {
        ...user,
        roles: user.roleAssignments.map(r => r.role),
      },
    });
  } catch (error) {
    console.error("Failed to fetch user profile:", error);
    return res.status(503).json({
      success: false,
      code: "SERVER_UNAVAILABLE",
      message: "Temporary server issue. Please retry later.",
    });
  }
};

// ---------- UPDATE ----------
const updateUser = async (req, res) => {
  try {
    const updates = { ...req.body };

    // Prevent restricted field changes
    const restricted = [
      "password",
      "refreshTokens",
      "resetToken",
      "resetTokenExpires",
      "id",
      "roles",
    ];
    restricted.forEach(field => delete updates[field]);

    // Ensure user exists first
    const existingUser = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        code: "USER_NOT_FOUND",
        message: "User not found or no changes made.",
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: updates,
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        fcmToken: true,
        createdAt: true,
        updatedAt: true,
        roleAssignments: { select: { role: true } },
      },
    });

    return res.json({
      success: true,
      message: "Profile updated successfully.",
      user: {
        ...updatedUser,
        roles: updatedUser.roleAssignments.map(r => r.role),
      },
    });
  } catch (error) {
    logger.error("User update failed:", error);
    return res.status(500).json({
      success: false,
      code: "UPDATE_FAILED",
      message: "Profile update failed. Please try again.",
    });
  }
};

// ---------- DELETE ----------
const deleteUser = async (req, res) => {
  try {
    const deletedUser = await prisma.user.delete({
      where: { id: req.user.id },
    });

    if (!deletedUser) {
      return res.status(404).json({
        success: false,
        code: "USER_NOT_FOUND",
        message: "User not found or already deleted.",
      });
    }

    // Clear all auth cookies
    clearMultipleCookies(res, ["userAccessToken", "userRefreshToken"]);

    return res.json({
      success: true,
      message: "Account permanently deleted.",
    });
  } catch (error) {
    logger.error("User account deletion failed:", error);

    // Handle Prisma-specific errors gracefully
    if (error.code === "P2025") {
      return res.status(404).json({
        success: false,
        code: "USER_NOT_FOUND",
        message: "User not found or already deleted.",
      });
    }

    return res.status(500).json({
      success: false,
      code: "DELETE_FAILED",
      message: "Account deletion failed. Please retry later.",
    });
  }
};

//UserController
const subscribeToGlobalUpdates = async (req, res) => {
  const { fcmToken } = req.body;
  if (!fcmToken || typeof fcmToken !== "string") {
    return res
      .status(400)
      .json({ success: false, message: "Invalid or missing FCM token" });
  }

  try {
    const response = await subscribeTokenToTopic(fcmToken, "global-updates");
    if (response.successCount === 0) {
      logger.warn("FCM subscription returned zero successes", { fcmToken, response });
      return res
        .status(500)
        .json({ success: false, message: "FCM subscription failed" });
    }

    console.log(`✅ Subscribed token to topic "global-updates":`, fcmToken);
    logger.info(`✅ Subscribed token to topic "global-updates":`, fcmToken);
    return res.json({ success: true, message: "Subscribed successfully" });

  } catch (err) {
    logger.error("❌ Topic subscription error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Subscription error", error: err.message });
  }
};

export {
  registerUser,
  verifyOTP,
  resendOTP,
  loginUser,
  resetPassword,
  forgotPassword,
  googleAuthCallback,
  googleAuthFailure,
  placesApi,
  updateFCMToken,
  deleteFCMToken,
  userLogout,
  userTokenRefresh,
  getUserProfile,
  updateUser,
  deleteUser,
  subscribeToGlobalUpdates,
};
