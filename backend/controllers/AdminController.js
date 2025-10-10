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
import { logger } from "../utils/logger.js";
import { notificationQueue } from "../queues/NotificationQueue.js";
import {connection as redis} from '../queues/connection.js';
import Joi from "joi";
import { normalizeIP } from "../utils/ip.js";
import { getClientIP } from "../utils/getClientIP.js";
dotenv.config();

// ----------- TOKEN HELPERS -----------
const signAccessToken = (user) =>
  jwt.sign({ id: user._id, roles: user.roles }, process.env.JWT_SECRET, { expiresIn: "1d" });

const signRefreshToken = (user) =>
  jwt.sign({ id: user._id }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: "7d" });


// ====================
// Ensure Super Admin Exists (with upsert)
// ====================
export async function ensureSuperAdminExists() {
  try {
    const adminPassword = process.env.ADMIN_PASS;
    const email = process.env.ADMIN_EMAIL;

    // Find user by email or create new
    let user = await UserModel.findOne({ email });
    if (!user) {
      user = await UserModel.create({
        name: "Super Admin",
        email,
        password: adminPassword,
        roles: ["super-admin", "admin", "admin-manager", "user"],
        verified: true,
      });
      await AdminProfile.create({
        user: user._id,
        is2FAVerified: false,
        isDisabled: false,
      });
    } else {
      // Ensure roles
      if (!user.roles.includes("super-admin")) {
        user.roles.push("super-admin");
        await user.save();
      }
      let adminProfile = await AdminProfile.findOne({ user: user._id });
      if (!adminProfile) {
        await AdminProfile.create({
          user: user._id,
          is2FAVerified: false,
          isDisabled: false,
        });
      }
    }
    console.log("✅ Super Admin ensured (created or updated)", email);
  } catch (error) {
    console.error("❌ Error ensuring Super Admin:", error);
  }
}

// ====================
// Create Admin (CRUD - CREATE)
// ====================
const createAdmin = async (req, res) => {
  const { name, email, password, twoFASecret } = req.body;

  // Input validation
  if (!email || !password || !name)
    return res.status(400).json({ success: false, message: "Name, email, and password are required" });

  if (!/^[^@]+@[^@]+\.[^@]+$/.test(email))
    return res.status(400).json({ success: false, message: "Invalid email format" });

  if (password.length < 8)
    return res.status(400).json({ success: false, message: "Password too short" });

  // Lowercase email for uniqueness
  const emailLower = email.toLowerCase();

  // Start transaction for atomicity
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let user = await UserModel.findOne({ email: emailLower }).session(session);
    if (user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(409).json({ success: false, message: "User already exists" });
    }

    user = await UserModel.create([{
      name,
      email: emailLower,
      password: password,
      roles: ["admin"],
      verified: true,
    }], { session });

    const adminProfile = await AdminProfile.create([{
      user: user[0]._id,
      twoFASecret: twoFASecret || null,
    }], { session });

    await session.commitTransaction();
    session.endSession();

    // Never return sensitive info
    res.status(201).json({
      success: true,
      user: {
        id: user[0]._id,
        name: user[0].name,
        email: user[0].email,
        roles: user[0].roles,
      },
      adminProfile: {
        id: adminProfile[0]._id,
        user: adminProfile[0].user,
        is2FAVerified: adminProfile[0].is2FAVerified,
        isDisabled: adminProfile[0].isDisabled,
      }
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ success: false, message: "Admin creation failed" });
  }
};

// ====================
// Get Admin Profile (CRUD - READ)
// ====================
const getAdminProfile = async (req, res) => {
  try {
    // 1. Get the access token from the cookie
    const token = req.cookies.adminAccessToken;
    if (!token) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    // 2. Verify the token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    // 3. Find the user
    const user = await UserModel.findById(decoded.id);
    if (
      !user ||
      !user.roles ||
      (!user.roles.includes("admin") && !user.roles.includes("super-admin"))
    ) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    return res.json({
      id: user._id,
      email: user.email,
      name: user.name,
      roles: user.roles,
      avatar: user.avatar,
      // add other fields as needed
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
};

// ====================
// Update Admin Profile (CRUD - UPDATE)
// ====================
const updateAdminAvatar = async (req, res) => {
  try {
    if(!req.file){
      return res.status(400).json({success:false, message:"File upload is required"});
    }
    const avatarUrl = req.file.path;
    const reqUser = req.user._id;
    const user = await UserModel.findByIdAndUpdate(
      reqUser,
      {avatar:avatarUrl},
      {new: true}
    );
    res.json({ success: true, user: {avatar:user.avatar}});
  } catch (error) {
    res.status(500).json({ success: false, message: "Update failed" });
  }
};

export const deleteAdminProfile = async (req, res) => {
  try {
    await AdminProfile.findOneAndDelete({ user: req.user._id });
    await UserModel.findByIdAndUpdate(req.user._id, { $pull: { roles: "admin" } });
    res.json({ success: true, message: "Admin profile deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Delete failed" });
  }
};

// --- LOGIN CONTROLLER 
const adminLogin = async (req, res) => {
  const { email, password} = req.body;
  const captchaToken = req.cookies?.admin_captcha;

    if (!captchaToken) {
      return res.status(400).json({ success: false, message: "Missing CAPTCHA token." });
    }

    try {
    // Verify the JWT token
    const decoded = jwt.verify(captchaToken, process.env.CAPTCHA_SECRET);
    const { jti, ip: ipFromToken, timestamp } = decoded;

    const normalizeIP = (ip) => {
      if (!ip) return '';
      return ip === '::1' ? '127.0.0.1' : ip.replace(/^::ffff:/, '');
    };

    const captchaIP = normalizeIP(ipFromToken);
    const requestIP = normalizeIP(getClientIP(req));

    // Verify IP match
    if (captchaIP !== requestIP) {
      return res.status(403).json({ 
        success: false, 
        message: "CAPTCHA verification failed. IP mismatch." 
      });
    }

    // Check if token is still valid in Redis
    const jtiKey = `security:captcha:jti:${jti}`;
    const tokenStatus = await redis.getdel(jtiKey);

    if (!tokenStatus || tokenStatus !== 'valid') {
      return res.status(403).json({ 
        success: false, 
        message: "CAPTCHA token is invalid or already used." 
      });
    }
    // Clear the CAPTCHA cookie
    res.clearCookie("admin_captcha", { path: "/api/admin" });

  } catch (err) {
    console.error('CAPTCHA token verification failed:', err);
    return res.status(403).json({ 
      success: false, 
      message: "CAPTCHA verification failed. Try again." 
    });
  }
     
      if (!email || !password) {
        return res.status(400).json({ success: false, message: "Email and password required." });
      }

  try {
    const user = await UserModel.findOne({ email });
    const allowedRoles = ["admin", "super-admin", "admin-manager"];
    if (!user || !user.roles.some(role => allowedRoles.includes(role))) {
      return res.status(401).json({ message: "Unauthorized Access." });
    }

    // --- Find admin profile ---
    const admin = await AdminProfile.findOne({ user: user._id }).select(
      "+failedLoginAttempts +lockUntil +twoFASecret +is2FAVerified +isDisabled"
    );
    if (!admin) {
      return res.status(401).json({ success: false, message: "Unauthorized access. ❌" });
    }

    // --- Account lock check ---
    if (admin.lockUntil && admin.lockUntil > Date.now()) {
      return res.status(423).json({ success: false, message: `Account locked until ${new Date(admin.lockUntil).toLocaleString()}` });
    }

    // --- Password check ---
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      admin.failedLoginAttempts += 1;
      if (admin.failedLoginAttempts >= 10) {
        admin.lockUntil = Date.now() + 15 * 60 * 1000; 
        admin.failedLoginAttempts = 0;
      }
      await admin.save();
      return res.status(401).json({ success: false, message: "Invalid credentials." });
    }
    admin.failedLoginAttempts = 0;
    admin.lockUntil = null;

    // --- IP allowlist ---
    const allowedIPs = process.env.ALLOWED_IPS
      ? process.env.ALLOWED_IPS.split(",").map((ip) => ip.trim())
      : [];
    let clientIP = req.headers["x-forwarded-for"] || req.connection.remoteAddress || "";
    if (clientIP.includes(",")) clientIP = clientIP.split(",")[0].trim();
    if (clientIP === "::1") clientIP = "127.0.0.1";
    if (allowedIPs.length && !allowedIPs.includes(clientIP)) {
      return res.status(403).json({ success: false, message: "Access denied from this IP address." });
    }

    // --- 2FA check ---
    if (process.env.ENABLE_2FA === "true" && !admin.is2FAVerified) {
      const tempToken = jwt.sign(
        { id: user._id, pre2FA: true, roles: user.roles },
        process.env.JWT_SECRET,
        { expiresIn: "5m" }
      );
      await admin.save();
      return res.status(403).json({
        success: false,
        message: "2FA verification required.",
        pre2FAToken: tempToken,
      });
    }

    // --- Generate tokens ---
    const accessToken = signAccessToken(user);
    const refreshTokenRaw = signRefreshToken(user);
    const hashedToken = await bcrypt.hash(refreshTokenRaw, 10);

    if (!Array.isArray(user.refreshTokens)) user.refreshTokens = [];
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
    await admin.save();

    setAppCookie(res, "adminRefreshToken", refreshTokenRaw, {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path:"/api/admin",
    });
    setAppCookie(res, "adminAccessToken", accessToken, {
      maxAge: 15 * 60 * 1000,
      path:"/api/admin",
    });

    res.clearCookie("admin_captcha", { path: "/api/admin" });

    return res.status(200).json({
      success: true,
      message: "Login successful",
      roles: user.roles,
      id: user._id,
    });
  } catch (error) {
    logger.error("adminLogin: server error", { error });
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

const strongPwdRegex = /^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[!@#$%^&*]).{8,}$/;

const changePassword = async (req, res) => {
  const { current, newPassword, confirmPassword } = req.body;

  if (!current || !newPassword || !confirmPassword)
    return res.status(400).json({ message: 'All fields are required.' });

  if (!strongPwdRegex.test(newPassword))
    return res.status(400).json({ message: 'Password does not meet complexity requirements.' });

  if (newPassword !== confirmPassword)
    return res.status(400).json({ message: 'New password and confirmation do not match.' });

  try {
    const user = await UserModel.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const match = await bcrypt.compare(current, user.password);
    if (!match)
      return res.status(401).json({ message: 'Current password is incorrect. ❌' });

    const isSameAsOld = await bcrypt.compare(newPassword, user.password);
    if (isSameAsOld)
      return res.status(400).json({ message: 'New password must be different from the old password.' });

    user.password = newPassword;
    await user.save();

    return res.json({ success: true, message: 'Password changed successfully.✅' });
  } catch (err) {-
    console.error(err);
    return res.status(500).json({ message: 'Server error during password change.' });
  }
};

// ====================
// Forgot Password
// ====================
const forgotPassword = async (req, res) => {
  const { email } = req.body;
  try {
    const user = await UserModel.findOne({ email, roles: ["admin", "super-admin", "admin-manager"] });
    if (!user) return res.status(404).json({ message: "Admin not found" });

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetToken = resetToken;
    user.resetTokenExpires = Date.now() + 60 * 60 * 1000; // 1 hour
    await user.save();
 b
    // Send Email
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      throw new Error("SMTP credentials are missing");
    }
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    const resetLink = `${process.env.FRONTEND_URL}/admin/reset-password/${resetToken}`;
    await transporter.sendMail({
      to: user.email,
      subject: "Admin Password Reset",
      html: `<p>Click the link below to reset your password:</p>
             <a href="${resetLink}">${resetLink}</a>
             <p>This link will expire in 1 hour.</p>`,
    });

    res.json({ message: "Password reset email sent ✅" });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ message: error.message || "Server error" });
  }
};

// ====================
// Reset Password
// ====================
const resetPassword = async (req, res) => {
  const { token } = req.params;
  const { newPassword } = req.body;
  try {
    const user = await UserModel.findOne({
      resetToken: token,
      resetTokenExpires: { $gt: Date.now() },
      roles: "admin"
    });
    if (!user) return res.status(400).json({ message: "Invalid or expired token" });

    user.password = newPassword;
    user.resetToken = undefined;
    user.resetTokenExpires = undefined;
    await user.save();

    res.json({ message: "Password reset successful" });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ message: error.message || "Server error" });
  }
};

// ====================
// Dashboard Statistics
// ====================
const getDashboardStats = async (req, res) => {
  try {
    // Total Bookings
    const totalBookings = await BookingModel.countDocuments();

    // Total Revenue: sum the 'amount' from each booking
    const revenueResult = await BookingModel.aggregate([
      { $group: { _id: null, totalRevenue: { $sum: "$amount" } } },
    ]);
    const totalRevenue = revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;

    // Total Rides
    const totalRides = await RideModel.countDocuments();

    // Total Users
    const totalUsers = await UserModel.countDocuments();

    // Total Drivers
    const totalDrivers = await DriverProfile.countDocuments();

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
    console.error("Error fetching dashboard stats:", error);
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
    const monthlyRevenue = await BookingModel.aggregate([
      {
        $group: {
          _id: { $month: "$bookingDate" },
          revenue: { $sum: "$amount" },
        },
      },
      { $sort: { "_id": 1 } },
      {
        $project: {
          month: "$_id",
          revenue: 1,
          _id: 0,
        },
      },
    ]);
    return res.status(200).json({ success: true, data: monthlyRevenue });
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
    const statusData = await BookingModel.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          name: "$_id",
          value: "$count",
          _id: 0,
        },
      },
    ]);
    return res.status(200).json({ success: true, data: statusData });
  } catch (error) {
    console.error("Error fetching booking status distribution:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
 
// ====================
// Get Monthly Bookings (for a Bar Chart)
// ====================
const getMonthlyBookings = async (req, res) => {
  try {
    const monthlyBookings = await BookingModel.aggregate([
      {
        $group: {
          _id: { $month: "$bookingDate" },
          bookings: { $sum: 1 },
        },
      },
      { $sort: { "_id": 1 } },
      {
        $project: {
          month: "$_id",
          bookings: 1,
          _id: 0,
        },
      },
    ]);
    return res.status(200).json({ success: true, data: monthlyBookings });
  } catch (error) {
    console.error("Error fetching monthly bookings:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get all rides (with driver details)
const getAllRides = async (req, res) => {
  try {
    const rides = await RideModel.find().populate("driver", "name email");
    res.json({ rides });
  } catch (error) {
    console.error("Error fetching rides:", error);
    res.status(500).json({ message: "Server error." });
  }
};

// Get a specific ride by its ID
const getRideById = async (req, res) => {
  try {
    const ride = await RideModel.findById(req.params.id).populate("driver", "name email");
    if (!ride) {
      return res.status(404).json({ message: "Ride not found." });
    }
    res.json({ ride });
  } catch (error) {
    console.error("Error fetching ride:", error);
    res.status(500).json({ message: "Server error." });
  }
};

// Get all drivers with their profile
const getAllDrivers = async (req, res) => {
  try {
    const users = await UserModel.find({ roles: "driver" })
      .select("name email avatar roles")
      .lean();

    // Find all driver profiles
    const profiles = await DriverProfile.find({ user: { $in: users.map(u => u._id) } }).lean();

    // Map profiles by userId for quick access
    const profileMap = {};
    profiles.forEach(profile => { profileMap[profile.user.toString()] = profile; });

    // Merge user and profile info
    const drivers = users.map(user => ({
      ...user,
      profile: profileMap[user._id.toString()] || null,
    }));

    res.json({ drivers });
  } catch (error) {
    console.error("Error fetching drivers:", error);
    res.status(500).json({ message: "Server error." });
  }
};

const approveDriver = async (req, res) => {
  try {
    const { driverId } = req.params;
    if (!driverId || !mongoose.Types.ObjectId.isValid(driverId)) {
      return res.status(400).json({ success: false, message: "Invalid or missing driverId." });
    }

    // Find the driver's profile
    const profile = await DriverProfile.findOne({ user: driverId });
    if (!profile) {
      return res.status(404).json({ success: false, message: "Driver profile not found" });
    }
    profile.approved = true;
    profile.status = "active";
    await profile.save();
    return res.status(200).json({ success: true, message: "Driver approved successfully" });
  } catch (error) {
    console.error("Error approving driver:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// Assign a ride to a driver
const assignRideToDriver = async (req, res) => {
  try {
    const { rideId, driverId } = req.body;

    // Validate ride existence
    const ride = await RideModel.findById(rideId);
    if (!ride) {
      return res.status(404).json({ message: "Ride not found." });
    }

    // Validate both user and driver profile existence
    const user = await UserModel.findById(driverId);
    if (!user || !user.roles.includes("driver")) {
      return res.status(404).json({ message: "Driver not found." });
    }
    const driverProfile = await DriverProfile.findOne({ user: driverId });
    if (!driverProfile) {
      return res.status(404).json({ message: "Driver profile not found." });
    }

    // Check max active rides for this driver
    const activeRidesCount = await RideModel.countDocuments({
      driver: driverId,
      status: { $in: ["scheduled", "in progress", "assigned", "pending approval"] },
    });
    if (activeRidesCount >= 4) {
      return res.status(400).json({ message: "Driver already has maximum active rides assigned." });
    }

    // Assign and update ride
    ride.driver = driverId;
    ride.status = "assigned";
    await ride.save();

    // Emit ride update event (if using socket.io)
    if (typeof io !== "undefined") {
      io.to(driverId.toString()).emit("rideUpdate", { ride });
      console.log(`Emitted rideUpdate event to driver ${driverId}`);
    }

    res.json({ message: "Ride assigned successfully.", ride });
  } catch (error) {
    console.error("Error assigning ride:", error);
    res.status(500).json({ message: "Server error." });
  }
};

// Update a ride's status
const updateRideStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const ride = await RideModel.findById(id);
    if (!ride) {
      return res.status(404).json({ message: "Ride not found." });
    }
    ride.status = status;
    await ride.save();
    res.json({ message: "Ride status updated.", ride });
  } catch (error) {
    console.error("Error updating ride status:", error);
    res.status(500).json({ message: "Server error." });
  }
};

const getDriverById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await UserModel.findById(id).select("name email avatar roles").lean();
    if (!user || !user.roles.includes("driver")) {
      return res.status(404).json({ message: "Driver not found." });
    }
    const profile = await DriverProfile.findOne({ user: id }).lean();
    res.json({ driver: { ...user, profile } });
  } catch (error) {
    console.error("Error fetching driver:", error);
    res.status(500).json({ message: "Server error." });
  }
};

// Get all bookings
const getAllBookings = async (req, res) => {
  try {
    const bookings = await BookingModel.find();
    res.json({ bookings });
  } catch (error) {
    console.error("Error fetching bookings:", error);
    res.status(500).json({ message: "Server error." });
  }
};

/**
 * GET /api/admin/commission
 * Retrieves the current active commission rate.
 */
const getCommissionRate = async (req, res) => {
  try {
    const config = await CommissionModel
      .findOne({ active: true })
      .sort({ effectiveFrom: -1 });

    if (!config) {
      return res.json({ success: true, rate: 0 });
    }

    return res.json({ success: true, rate: config.rate });
  } catch (err) {
    console.error("Error fetching commission rate:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * POST /api/admin/commission
 * Sets a new platform commission rate.
 * Body: { rate: Number (0–1), effectiveFrom?: Date }
 */
export const setCommissionRate = async (req, res) => {
  try {
    const { rate, effectiveFrom } = req.body;
    if (rate == null || rate < 0 || rate > 1) {
      return res.status(400).json({ success: false, message: "Rate must be between 0 and 1" });
    }

    // Deactivate existing configs
    await CommissionModel.updateMany(
      { active: true },
      { active: false }
    );

    // Create and activate new config
    const config = await CommissionModel.create({
      rate,
      effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
      active: true,
    });

    return res.json({ success: true, config });
  } catch (err) {
    console.error("Error setting commission rate:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const addRide = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Image is required" });
    }

    // Geocode the pickup and destination addresses
    let pickupCoords, destinationCoords;
    try {
      pickupCoords = await geocodeAddress(req.body.pickup);
      destinationCoords = await geocodeAddress(req.body.destination);
    } catch (geoError) {
      return res.status(400).json({ success: false, message: geoError.message });
    }

    const ride = new RideModel({
      pickup: req.body.pickup,
      destination: req.body.destination,
      price: req.body.price,
      description: req.body.description,
      selectedDate: req.body.selectedDate, // e.g., "2025-02-07"
      selectedTime: req.body.selectedTime,   // e.g., "14:30"
      passengers: req.body.passengers,
      imageUrl: req.file.path,               // Cloudinary or local URL
      type: req.body.type,
      status: req.body.status || "scheduled",
      driver: req.body.driver,
      // Store coordinates as GeoJSON Points
      pickupLocation: {
        type: "Point",
        coordinates: [pickupCoords.longitude, pickupCoords.latitude],
      },
      destinationLocation: {
        type: "Point",
        coordinates: [destinationCoords.longitude, destinationCoords.latitude],
      },
    });

    await ride.save();
    return res.json({ success: true, message: "Ride added successfully", ride });
  } catch (error) {
    console.error("Error in addRide:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// List all rides (unprotected listing endpoint)
const listRide = async (req, res) => {
  try {
    const ride = await RideModel.find({});
    res.json({ success: true, data: ride });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: "Error" });
  }
};

const removeRide = async (req, res) => {
  try {
    // Verify admin authentication
    const admin = await AdminModel.findById(req.admin.id);
    if (!admin) {
      return res.status(401).json({ success: false, message: "Unauthorized " });
    }

    await RideModel.findByIdAndDelete(req.body.id);
    res.json({ success: true, message: "Ride Removed" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error" });
  }
};


// Search rides based on query parameters
const rideSearch = async (req, res) => {
  try {
    const { pickup, destination, selectedDate, passengers } = req.query;
    if (!pickup || !destination || !selectedDate || !passengers) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Convert date to range for searching
    const searchDate = new Date(selectedDate);
    const startOfDay = new Date(searchDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(searchDate.setHours(23, 59, 59, 999));

    const rides = await RideModel.find({
      pickup: new RegExp(pickup, "i"), // Case-insensitive
      destination: new RegExp(destination, "i"),
      selectedDate: { $gte: startOfDay, $lte: endOfDay },
      passengers: { $gte: parseInt(passengers) },
    });

    if (!rides.length) {
      return res.status(404).json({ message: "No rides found" });
    }

    res.json(rides);
  } catch (error) {
    console.error("Error searching rides:", error);
    res.status(500).json({ message: "Server error" });
  }
};
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

    // 1) Validate input
    if (
      !name || !email || !password ||
      !phone || !licenseNumber ||
      !vehicleType || !model ||
      !registrationNumber || !capacity
    ) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }

    // 2) Find or create the user
    let user = await UserModel.findOne({ email });

    if (!user) {
      // a) New user — create them with driver role
      const avatar = req.file?.path || "";
      user = new UserModel({
        name,
        email,
        password, // assume pre-save hook hashes this
        avatar,
        roles: ["driver"],
        verified: true,
      });
      await user.save();
    } else {
      // b) Existing user
      //   i) If they don’t have driver role, add it
      if (!user.roles.includes("driver")) {
        user.roles.push("driver");
        if (!user.password) {
          user.password = password;
        }
        if (req.file && !user.avatar) {
          user.avatar = req.file.path;
        }
        await user.save();
      }
    }

    let driverProfile = await DriverProfile.findOne({ user: user._id });

    if (driverProfile) {
      return res
        .status(400)
        .json({ success: false, message: "Driver profile already exists" });
    }

    // 4) Create the new driverProfile
    driverProfile = new DriverProfile({
      user: user._id,
      phone,
      licenseNumber,
      vehicle: {
        vehicleType,
        model,
        registrationNumber,
        capacity: Number(capacity),
      },
      status: "pending",
      approved: false,
    });
    await driverProfile.save();

    // 5) Return success
    return res.status(201).json({
      success: true,
      message: "Driver added successfully",
      driver: { user, profile: driverProfile },
    });
  } catch (error) {
    console.error("Error adding driver:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};


const updateRideDetails = async (req, res) => {
  try {
    const { id } = req.params;
    // Gather update data from req.body
    const updateData = { ...req.body };

    if (req.file) {
      updateData.imageUrl = req.file.path;
    }

    if (updateData.selectedDate) {
      updateData.selectedDate = new Date(updateData.selectedDate);
    }

    const updatedRide = await RideModel.findByIdAndUpdate(id, updateData, { new: true });
    if (!updatedRide) {
      return res.status(404).json({ message: "Ride not found." });
    }
    res.json({ success: true, message: "Ride updated successfully.", ride: updatedRide });
  } catch (error) {
    console.error("Error updating ride:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
};

const updateDriverDetails = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ success: false, message: "Invalid driver ID." });

    // 1) Update the User (name / email / avatar)
    const userUpdates = {};
    ['name','email'].forEach(f => { if (req.body[f]) userUpdates[f] = req.body[f]; });
    if (req.file) userUpdates.avatar = req.file.path;
    const user = await UserModel.findByIdAndUpdate(id, userUpdates, { new: true });
    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    // 2) Update the DriverProfile
    const profileUpdates = {};
    ['phone','licenseNumber','capacity'].forEach(f => {
      if (req.body[f] !== undefined) profileUpdates[f] = req.body[f];
    });
    // vehicle is nested
    if (req.body.vehicleType || req.body.model || req.body.registrationNumber) {
      profileUpdates.vehicle = {
        vehicleType: req.body.vehicleType,
        model: req.body.model,
        registrationNumber: req.body.registrationNumber,
        capacity: req.body.capacity
      }
    }
    const profile = await DriverProfile.findOneAndUpdate(
      { user: id },
      profileUpdates,
      { new: true }
    );
    if (!profile)
      return res.status(404).json({ success: false, message: "Driver profile not found." });

    return res.json({
      success: true,
      message: "Driver updated successfully.",
      driver: { ...user.toObject(), profile: profile.toObject() }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

const setup2FA = async (req, res) => {
  try {
    const user = await UserModel.findById(req.preAdminId);
    if (!user) {
      return res.status(404).json({ success: false, message: "Admin not found." });
    }
    let admin = await AdminProfile.findOne({ user: user._id });
    if (!admin) {
      admin = await AdminProfile.create({ user: user._id });
    }

    if (!admin.twoFASecret) {
      const newSecret = speakeasy.generateSecret({
        length: 20,
        name: `TOLI-TOLI (${user.email})`,
      });
      admin.twoFASecret = newSecret.base32;
      await admin.save();
    }

    // Create an otpauth URL (Google Authenticator-style)
      const otpauthURL = speakeasy.otpauthURL({
      secret: admin.twoFASecret,
      label: encodeURIComponent(`TOLI‑TOLI Admin:${user.email}`),
      issuer: "TOLI‑TOLI",
      algorithm: "sha1",    
      digits: 6,           
      period: 60,           
      encoding: "base32",
    });

    const qrDataURL = await qrcode.toDataURL(otpauthURL);

    if (!admin.backupCodes || admin.backupCodes.length === 0) {
      const { plainCodes, codes } = await generateBackupCodes(); 
      admin.backupCodes = codes;
      admin.backupCodesGeneratedAt = new Date();
      await admin.save();

      return res.status(200).json({ success: true, qrDataURL, backupCodes: plainCodes });
    }

    return res.status(200).json({ success: true, qrDataURL });
  } catch (err) {
    console.error("generate2FAQr error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

const verify2FA = async (req, res) => {
  const { totpCode } = req.body;
  if (!totpCode) {
    return res.status(400).json({ success: false, message: "Missing TOTP code." });
  }

  try {
    // Find admin user and profile
    const user = await UserModel.findById(req.preAdminId);
    if (!user) {
      return res.status(404).json({ success: false, message: "Admin not found." });
    }
    const admin = await AdminProfile.findOne({ user: user._id }).select(
      "+twoFASecret +failedLoginAttempts +lockUntil +isDisabled +is2FAVerified"
    );
    if (!admin) {
      return res.status(404).json({ success: false, message: "Admin profile not found." });
    }

    // 2) Check if disabled
    if (admin.isDisabled) {
      return res.status(403).json({ success: false, message: "Account disabled." });
    }

    // 3) Check if locked
    if (admin.lockUntil && admin.lockUntil > Date.now()) {
      const unlockTime = new Date(admin.lockUntil).toLocaleString();
      return res.status(423).json({
        success: false,
        message: `Account locked until ${unlockTime}.`,
      });
    }

    if (!admin.twoFASecret) {
      return res.status(400).json({ success: false, message: "2FA not set up for this account." });
    }

    const verified = speakeasy.totp.verify({
      secret: admin.twoFASecret,
      encoding: "base32",
      token: totpCode,
      window: 1,
    });

    if (!verified) {
      return res.status(401).json({ success: false, message: "Invalid 2FA code." });
    }

    if (!admin.is2FAVerified) {
      admin.is2FAVerified = true;
      await admin.save();
    }

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
      message: "2FA verification successful.",
      roles: user.roles,
    });
  } catch (err) {
    console.error("verify2FA error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

const adminTokenRefresh = async (req, res) => {
  const refreshToken = req.cookies.adminRefreshToken;
  if (!refreshToken) return res.status(401).json({ message: "No refresh token." });

  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    const user = await UserModel.findById(decoded.id);
    const allowedRoles = ["admin", "super-admin", "admin-manager"];
    if (!user || !user.roles.some(role => allowedRoles.includes(role))) {
      return res.status(401).json({ message: "Admin not found." });
    }

    // Find admin profile for completeness (optional)
    const adminProfile = await AdminProfile.findOne({ user: user._id });
    if (!adminProfile) {
      return res.status(401).json({ message: "Admin profile not found." });
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

    // Generate new tokens
    const newAccessToken = signAccessToken(user);
    const newRefreshRaw = signRefreshToken(user);
    const newHashed = await bcrypt.hash(newRefreshRaw, 10);

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

      setAppCookie(res, "adminRefreshToken", newRefreshRaw, {
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path:"/api/admin",
      });
      setAppCookie(res, "adminAccessToken", newAccessToken, {
        maxAge: 15 * 60 * 1000,
        path:"/api/admin",
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

const adminLogout = async (req, res) => {
  const refreshToken = req.cookies?.adminRefreshToken;

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
  clearMultipleCookies(res, ["adminAccessToken", "adminRefreshToken"]);
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
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 3 * 60 * 1000, // 3 minutes
      path: "/api/admin",
    });

    res.status(200).json({ 
      success: true, 
      message: "CAPTCHA verified." 
    });

  } catch (error) {
    console.error('CAPTCHA verification error:', error);
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
  updateAdminAvatar,
  publishGlobalUpdate,
  publishDivers,
};
