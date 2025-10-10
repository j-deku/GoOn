import UserModel from "../models/UserModel.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import validator from "validator";
import OTPModel from "../models/OTPModel.js";
import { generateOTP } from "../utils/generateOTP.js";
import { sendEmail } from "../utils/sendEmail.js";
import {
  EmailOTP,
  EmailWelcome,
  ResendEmail,
  VerifiedEmail,
} from "../utils/EmailTemplates.js";
import { sendPushNotification, subscribeTokenToTopic } from "../utils/pushNotification.js";
import Notification from "../models/NotificationModel.js";
import crypto from "crypto";
import dotenv from "dotenv";
import { clearMultipleCookies, setAppCookie } from "../utils/CookieHelper.js";
import logger from "../middlewares/logger.js";
dotenv.config();

const signAccessToken = (user) =>
  jwt.sign({ id: user._id, roles: user.roles }, process.env.JWT_SECRET, { expiresIn: "15m" });

const signRefreshToken = (user) =>
  jwt.sign({ id: user._id }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: "7d" });

const registerUser = async (req, res) => {
  const { name, password, email, googleId, fcmToken } = req.body;
  try {
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
    const exists = await UserModel.findOne({ email });
    if (exists) {
      return res.status(400).json({ success: false, message: "User already exists" });
    }
    const newUser = new UserModel({
      name,
      email,
      password,
      verified: false,
      ...(googleId && { googleId }),
      ...(fcmToken && { fcmToken }),
      roles: ["user"],
    });
    const user = await newUser.save();

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await sendEmail(user.email, "Email Verification 🚌", EmailOTP(user.name, otp));
    await OTPModel.create({ userId: user._id, otp, expiresAt });

    if (user.fcmToken) {
      try {
        await sendPushNotification(
          user.fcmToken,
          {
            title: `Welcome, ${user.name}!`,
            body: "You have successfully registered in TOLI-TOLI. Check your dashboard for more updates 😊",
            data: {
              type: "register",
              tag: "register",
              url: "/myBookings"
            }
          }
        );
      await subscribeTokenToTopic(user.fcmToken);

      } catch (pushErr) {
        logger.error("Login push failed:", pushErr.code || pushErr.message);
      }
    }

    res.status(200).json({
      success: true,
      message: "OTP sent to your email",
      redirect: "/verify-otp",
      userId: user._id,
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ success: false, message: "Server is down. Please try again later" });
  }
};

const loginUser = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await UserModel.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: "No account found with this email. Please register first." });
    }
    if (!user.verified) {
      return res.status(403).json({ success: false, message: "Please verify your email to continue.", redirect: "/verify-otp" });
    }
    if (!user.password) {
      return res.status(400).json({ success: false, message: "Use Google login for this account." });
    }
    if (user.lockUntil && user.lockUntil > Date.now()) {
      return res.status(423).json({ success: false, message: "⚠️ Account is temporary locked due to too many failed attempts. \n Try again later" });
    }
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= 5) {
        user.lockUntil = Date.now() + 30 * 60 * 1000; // 30 min lock
        await user.save();
        return res.status(423).json({ success: false, message: "Account locked due to too many failed attempts." });
      }
      await user.save();
      return res.status(401).json({ success: false, message: "Incorrect credentials." });
    }
    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;

    const accessToken = signAccessToken(user);
    const refreshTokenRaw = signRefreshToken(user);

    if(!Array.isArray(user.refreshTokens)) user.refreshTokens = [];
    const hashedToken = await bcrypt.hash(refreshTokenRaw, 10);
    user.refreshTokens = [
      ...user.refreshTokens
        .filter(rt => !rt.revoked && (!rt.expiresAt || rt.expiresAt > new Date()))
        .slice(-4),
      {
        token: hashedToken,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        revoked: false,
      },
    ];
    await user.save();

    await sendEmail(user.email, "Welcome Back 🚌", EmailWelcome(user.name));

    await Notification.create({
      userId: user._id,
      title: `Welcome back, ${user.name}!`,
      body:  "You have successfully logged in into TOLI‑TOLI. Check your dashboard for updates 😊",
      type:  "login",
      isRead: false,
      // no jobId here, since it’s immediate
    });

    if (user.fcmToken) {
      try {
        await sendPushNotification(user.fcmToken, {
          title: `Welcome back, ${user.name}!`,
          body: "You have successfully logged in into TOLI-TOLI. Check your dashboard for updates 😊",
          data: { type: "login", tag: "login", url: "/myBookings" },
        });
        // ensure token is on the topic (idempotent)
      await subscribeTokenToTopic(user.fcmToken);

      } catch (pushErr) {
        logger.warn("Login push failed:", pushErr.code || pushErr.message);
      }
    }

      setAppCookie(res, "userRefreshToken", refreshTokenRaw, {
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path:"/",
      });
      setAppCookie(res, "userAccessToken", accessToken, {
        maxAge: 15 * 60 * 1000,
        path:"/",
      });

    return res.json({ success: true, roles: user.roles, userId: user._id.toString(), message: "Login successful!" });
  } catch (err) {
   logger.error("Error in loginUser:", {
    message: err.message,
    stack: err.stack,
  });
    return res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
  }
};

const forgotPassword = async (req, res) => {
  const { email } = req.body;
  try {
    const user = await UserModel.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetToken = resetToken;
    user.resetTokenExpires = Date.now() + 60 * 60 * 1000;
    await user.save();
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    await sendEmail(user.email, "Reset Your Password", `Click the link to reset: ${resetUrl}`);
    res.json({ success: true, message: "Password reset link sent to your email." });
  } catch (err) {
    logger.error("Forgot password error:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
};

const resetPassword = async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;
  try {
    const user = await UserModel.findOne({ resetToken: token, resetTokenExpires: { $gt: Date.now() } });
    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid or expired token." });
    }
    user.password = password;
    user.resetToken = undefined;
    user.resetTokenExpires = undefined;
    await user.save();
    res.json({ success: true, message: "Password reset successful." });
  } catch (err) {
    logger.error("Reset password error:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
};

// Verify OTP
const verifyOTP = async (req, res) => {
  const { userId, otp, token } = req.body;
  try {
    let user;
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      user = await UserModel.findById(decoded.id);
    } else {
      user = await UserModel.findById(userId);
    }

    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    if (token || (await OTPModel.findOne({ userId, otp }))) {
      user.verified = true;
      await user.save();
      await OTPModel.deleteOne({ userId });

      await sendEmail(
        user.email,
        "Successful Verification 🚌",
        VerifiedEmail(user.name)
      );
      const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
      const redirectUrl = `${FRONTEND_URL}/?name=${encodeURIComponent(
        user.name
      )}&email=${encodeURIComponent(user.email)}`;
      return res.json({
        success: true,
        message: "Email verified successfully",
        redirect: redirectUrl,
        token: signAccessToken(user),
        user: { name: user.name, email: user.email },
      });
    }

    res.json({ success: false, message: "Invalid OTP" });
  } catch (error) {
    logger.error(error);
    res.json({ success: false, message: "Network Unstable" });
  }
};

// Resend OTP
const resendOTP = async (req, res) => {
  const { userId } = req.body;
  try {
    const user = await UserModel.findById(userId);
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

    await sendEmail(
      user.email,
      "Email Verification 🚌",
      ResendEmail(user.name, otp, verificationUrl)
    );
    await OTPModel.updateOne({ userId: user._id }, { otp, expiresAt });

    res.json({ success: true, message: "OTP resent successfully" });
  } catch (error) {
    logger.error(error);
    res.json({ success: false, message: "Network Unstable" });
  }
};

const googleAuthCallback = async (req, res) => {
  try {
    console.log("Google Profile Data:", req.user);

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Google authentication failed",
      });
    }

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

    let user = await UserModel.findOne({ email });

    if (!user) {
      user = await UserModel.create({
        name,
        email,
        avatar,
        googleId,
        verified: true,
      });
    }

        // Generate new tokens
        const accessToken = signAccessToken(user);
        const refreshTokenRaw = signRefreshToken(user);
        const newHashed = await bcrypt.hash(refreshTokenRaw, 10);
    
        if (!Array.isArray(user.refreshTokens)) user.refreshTokens = [];
        user.refreshTokens.push({
          token: newHashed,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          revoked: false,
        });
        await user.save();
    
          setAppCookie(res, "userRefreshToken", refreshTokenRaw, {
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path:"/",
          });
          setAppCookie(res, "userAccessToken", accessToken, {
            maxAge: 15 * 60 * 1000,
            path:"/",
          });
    
    await sendEmail(email, "Welcome Back 🚌", EmailWelcome(user.name));

    const redirectUrl = new URL(process.env.FRONTEND_URL);
    redirectUrl.pathname = "/"; 
    redirectUrl.searchParams.set("name", user.name);
    redirectUrl.searchParams.set("email", user.email);
    redirectUrl.searchParams.set("avatar", avatar);

    res.redirect(redirectUrl.toString());

    // Send push notification
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
        logger.error("Login push failed:", pushErr.code || pushErr.message);
      }
    } else {
      logger.warn("No FCM token for user; push not sent.");
    }

    const notificationMessage = `Hi ${user.name}! Welcome back to TOLI-TOLI.`;
    await Notification.create({
      userId: user._id,
      message: notificationMessage,
      type: "login",
      isRead: false,
    });

    return res.status(200).json({
      success: true,
      message: "Login successful",
      user: {
        roles: user.roles,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
      },
    });

  } catch (error) {
    res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_error`);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// Google login failure
const googleAuthFailure = (req, res) => {
  res.status(401).json({
    success: false,
    message: "Failed to authenticate with Google",
  });
  console.error("Google authentication failed:", req.query.error);
  // Redirect to login page with error message
  res.redirect(process.env.FRONTEND_URL + "/?error=google_auth_failed");
};

const GOOGLE_API_KEY = process.env.GOOGLE_MAP_API;

const placesApi = async (req, res) => {
  const input = req.query.input; // Get input from query params
  const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
    input
  )}&key=${GOOGLE_API_KEY}&types=geocode`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch data from Google API" });
  }
};

const updateFCMToken = async (req, res) => {
  try {
    const { fcmToken } = req.body;
    const userId = req.user.id; 
    if (!fcmToken) {
      return res
        .status(400)
        .json({ success: false, message: "FCM token is required" });
    }
    const updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      { fcmToken },
      { new: true }
    );
    await subscribeTokenToTopic(fcmToken, 'global-updates');
    return res
      .status(200)
      .json({ success: true, message: "FCM token updated", user: updatedUser });
  } catch (error) {
    logger.error("Error updating FCM token:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const deleteFCMToken = async (req, res) => {
  try {
    const { fcmToken } = req.body;
    const userId = req.user.id;
    if (!fcmToken) {
      return res.status(400).json({ success: false, message: 'FCM token is required' });
    }

     await UserModel.findByIdAndUpdate(userId, { $unset: { fcmToken: '' } });

    return res.status(200).json({ success: true, message: 'FCM token removed' });
  } catch (error) {
    logger.error('Error deleting FCM token:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
// --- USER REFRESH TOKEN FLOW (plain tokens, not hashed) ---
const userTokenRefresh = async (req, res) => {
  const refreshToken = req.cookies.userRefreshToken;
  if (!refreshToken) return res.status(401).json({ message: "No refresh token." });

  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    const user = await UserModel.findById(decoded.id);
       if (!user || !Array.isArray(user.roles) || !user.roles.includes('user')) {
        return res.status(403).json({ message: "User not found or role not allowed." });
      }

    let valid = false;
    if (Array.isArray(user.refreshTokens)) {
      for (const rt of user.refreshTokens) {
        if (rt.revoked) continue;
        if (rt.expiresAt && rt.expiresAt <= new Date()) continue;
        if (await bcrypt.compare(refreshToken, rt.token)) {
          valid = true;
          break;
        }
      }
    }

    if (!valid) {
      return res.status(401).json({ code: 'REFRESH_INVALID', message: "Invalid or expired refresh token." });
    }

    const newAccessToken = signAccessToken(user);
    const newRefreshTokenRaw = signRefreshToken(user);
    const newHashed = await bcrypt.hash(newRefreshTokenRaw, 10);

    // Save new hashed refresh token (prune old/expired tokens)
    if(!Array.isArray(user.refreshTokens)) user.refreshTokens = [];
    user.refreshTokens = user.refreshTokens
      .filter(rt => !rt.revoked && (!rt.expiresAt || rt.expiresAt > new Date()))
      .slice(-4);
    user.refreshTokens.push({
      token: newHashed,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      revoked: false,
    });
    await user.save();

      setAppCookie(res, "userRefreshToken", newRefreshTokenRaw, {
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path:"/",
      });
      setAppCookie(res, "userAccessToken", newAccessToken, {
        maxAge: 15 * 60 * 1000,
        path:"/",
      });

    return res.json({ success: true, roles: user.roles, message: "Token refreshed" });
  } catch (err) {
       if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
      return res.status(403).json({ code: 'JWT_INVALID', message: "Invalid refresh token." });
    }
    logger.error("Refresh token internal error", err);
    return res.status(500).json({ code: 'REFRESH_INTERNAL', message: "Server error during refresh." });
  }
};

const userLogout = async (req, res) => {
  const refreshToken = req.cookies?.userRefreshToken;

  if (refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
      const user = await UserModel.findById(decoded.id);

      if (user && Array.isArray(user.refreshTokens) && user.refreshTokens.length) {
        let updated = false;

        for (const rt of user.refreshTokens) {
          if (rt.revoked) continue;
          if (await bcrypt.compare(refreshToken, rt.token)) {
            rt.revoked = true;
            updated = true;
          }
        }

        if (updated) {
          await user.save();
        }
      }
    } catch (err) {
      console.warn("Logout: token verify/revoke failed (continuing):", err.message);
    }
  }
  // Clear all auth-related cookies
  clearMultipleCookies(res, ["userAccessToken", "userRefreshToken"]);
  return res.status(200).json({ success: true, message: "Logged out." });
};

// ---------- READ: Get Current User Profile ----------
const getUserProfile = async (req, res) => {
  try {
    const user = await UserModel.findById(req.user._id)
      .select("name email roles createdAt updatedAt avatar fcmToken")
      .lean();

    if (!user) {
      return res.status(403).json({success: false, code: "AUTH_INVALID", message: "Invalid authentication state.",});
    }

    res.json({ success: true, user });
  } catch (error) {
    console.error("Failed to fetch user profile:", error);
    return res.status(503).json({success: false, code: "SERVER_UNAVAILABLE", message: "Temporary server issue. Please retry.",});
  }
};

// ---------- UPDATE ----------
const updateUser = async (req, res) => {
  try {
    const updates = req.body;
    ["password", "refreshTokens", "resetToken", "resetTokenExpires", "_id", "roles"].forEach(f => delete updates[f]);
    const user = await UserModel.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true }).select("-password -refreshTokens");
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: "Update failed" });
  }
};

// ---------- DELETE ----------
const deleteUser = async (req, res) => {
  try {
    await UserModel.findByIdAndDelete(req.user._id);
    res.clearCookie("userAccessToken");
    res.clearCookie("userRefreshToken");
    res.json({ success: true, message: "Account deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Delete failed" });
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
