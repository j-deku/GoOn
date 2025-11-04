import RideModel from "../models/RideModel.js";
import BookingModel from "../models/BookingModel.js";
import UserModel from "../models/UserModel.js";
import validator from "validator";
import bcrypt from 'bcryptjs' // Ensure this is imported
import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();
import crypto from "crypto";
import jwt from 'jsonwebtoken'
import { io } from "../sever.js"; // Import socket.io instance
import {sendPushNotification} from "../utils/pushNotification.js"
import Notification from "../models/NotificationModel.js";
import geocodeAddress from "../utils/geocodeAddress.js";
import CommissionModel from "../models/CommissionModel.js";
import DriverProfile from "../models/DriverProfile.js";
import { clearMultipleCookies, setAppCookie } from "../utils/CookieHelper.js";
import mongoose from "mongoose";
import { notificationQueue } from "../queues/NotificationQueue.js";
import logger from "../middlewares/logger.js";
import prisma from "../config/Db.js";
import { UserRole, DriverStatus } from "@prisma/client";
import { logActivity } from "../utils/logActivity.js";

const scheduleRideReminder = (ride) => {
  const rideTime = new Date(ride.selectedDate).getTime();
  const reminderTime = rideTime - 15 * 60 * 1000; // 15 minutes before
  const now = Date.now();
  const delay = reminderTime - now;
  if (delay > 0) {
    setTimeout(() => {
      // Emit a reminder event to the driver's room
      io.to(ride.driver.toString()).emit("rideReminder", { ride });
      console.log("Sent ride reminder for ride:", ride._id);
    }, delay);
  }
};

// ----------- TOKEN HELPERS -----------
const signAccessToken = (user) =>
  jwt.sign({ id: user.id, roles: user.roles }, process.env.JWT_SECRET, { expiresIn: "1d" });

const signRefreshToken = (user) =>
  jwt.sign({ id: user.id }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: "7d" });

const registerDriver = async (req, res) => {
  
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

  const avatar = req.file ? req.file.path : null;
  console.log("🧾 req.body:", req.body);
console.log("📸 req.file:", req.file);

  // 1️⃣ Validate required fields
  if (
    !name ||
    !email ||
    !password ||
    !avatar ||
    !phone ||
    !licenseNumber ||
    !vehicleType ||
    !model ||
    !registrationNumber ||
    !capacity
  ) {
    return res.status(422).json({
      success: false,
      message: "All driver fields are required.",
    });
  }

  // 2️⃣ Validate email and password
  if (!validator.isEmail(email)) {
    return res.status(422).json({
      success: false,
      message: "Invalid email format.",
    });
  }

  if (!validator.isStrongPassword(password, { minLength: 8 })) {
    return res.status(422).json({
      success: false,
      message:
        "Password must be ≥8 chars and include uppercase, lowercase & special character.",
    });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 3️⃣ Check if user exists
      let user = await tx.user.findUnique({
        where: { email },
        include: {
          roleAssignments: true,
          driverProfile: true,
        },
      });

      // === CASE 1: Existing user ===
      if (user) {
        const hasDriverRole = user.roleAssignments.some(
          (r) => r.role === UserRole.DRIVER
        );
      console.log("🟠 Existing user flow reached:", email);
        if (hasDriverRole) {
          throw {
            status: 409,
            message:
              "A driver account with this email already exists. Please log in.",
          };
        }

        // Update password if missing
        let hashedPassword = user.password;
        if (!user.password) {
          const salt = await bcrypt.genSalt(10);
          hashedPassword = await bcrypt.hash(password, salt);
        }

        // Add driver role
        await tx.user.update({
          where: { id: user.id },
          data: {
            password: hashedPassword,
            avatar,
            roleAssignments: {
              create: {
                role: UserRole.DRIVER,
              },
            },
          },
        });

        // Create driver profile
        const driverProfile = await tx.driverProfile.create({
          data: {
            userId: user.id,
            phone,
            licenseNumber,
            vehicleType,
            model,
            registrationNumber,
            capacity: Number(capacity),
            status: DriverStatus.pending,
            approved: false,
          },
        });

        return {
          status: 200,
          driver: {
            id: driverProfile.id,
            name: user.name,
            email: user.email,
            phone: driverProfile.phone,
            avatar,
          },
          message:
            "Driver role added and profile created. Awaiting admin approval.",
        };
      }

      // === CASE 2: New user registration ===
      console.log("🟢 New user flow reached:", email);
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      const newUser = await tx.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          avatar,
          verified: true,
          roleAssignments: {
            create: {
              role: UserRole.DRIVER,
            },
          },
        },
      });

      const driverProfile = await tx.driverProfile.create({
        data: {
          userId: newUser.id,
          phone,
          licenseNumber,
          vehicleType,
          model,
          registrationNumber,
          capacity: Number(capacity),
          status: DriverStatus.pending,
          approved: false,
        },
      });

      return {
        status: 201,
        driver: {
          id: driverProfile.id,
          name: newUser.name,
          email: newUser.email,
          phone: driverProfile.phone,
          avatar,
        },
        message: "Driver registration successful. Awaiting admin approval.",
      };
    });

    setAppCookie(res, "driverRegisteredEmail", email, {
      maxAge: 1000 * 60 * 10, // 10 minutes    
      path: "/",
    });

    return res.status(result.status).json({
      success: true,
      message: result.message,
      driver: result.driver,
    });
  } catch (error) {
    // Duplicate email constraint
    if (error.code === "P2002" && error.meta?.target?.includes("email")) {
      return res.status(409).json({
        success: false,
        message:
          "This email is already in use. Please log in or use a different email.",
      });
    }

    // Custom thrown error
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }

    console.error("registerDriver error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error registering driver.",
    });
  }
};

const formSubmitted = async (req, res) => {
  try {
    // 🧩 Extract and sanitize cookie
    const driverRegisteredEmail = req.cookies?.driverRegisteredEmail?.trim();

    // 1️⃣ Validate cookie presence
    if (!driverRegisteredEmail) {
      return res.status(400).json({
        success: false,
        message: "No recent driver registration found. Please register first.",
      });
    }

    // 2️⃣ Optional: verify that this email exists in the database
    const existingUser = await prisma.user.findUnique({
      where: { email: driverRegisteredEmail },
      select: { id: true, name: true, verified: true },
    });

    if (!existingUser) {
      // Cookie exists but user not found — possible stale cookie or tampering
      setAppCookie(res, "driverRegisteredEmail", "", {
        maxAge: 10 * 60 * 1000, // 10 minutes
        path: "/",
      });
      return res.status(404).json({
        success: false,
        message: "Registration record not found. Please register again.",
      });
    }
    // 4️⃣ Response
    return res.status(200).json({
      success: true,
      message: "Form submitted successfully. Awaiting admin approval.",
      data: {
        email: driverRegisteredEmail,
        verified: existingUser.verified,
      },
    });
  } catch (error) {
    console.error("❌ Error verifying form submission:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while verifying form submission.",
    });
  }
};

const loginDriver = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1️⃣ Missing fields
    if (!email || !password) {
      return res.status(422).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    // 2️⃣ Find user and roles
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        roleAssignments: true,
        driverProfile: true,
        refreshTokens: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const roles = user.roleAssignments.map((r) => r.role);

    // Must be driver
    if (!roles.includes("DRIVER")) {
      return res.status(401).json({
        success: false,
        message: "Not authorized as driver. Please register first.",
      });
    }

    // 3️⃣ Ensure driver profile exists
    const driverProfile = user.driverProfile;
    if (!driverProfile) {
      return res.status(404).json({
        success: false,
        message: "Driver profile not found.",
      });
    }

    // 4️⃣ Check approval + status
    if (!driverProfile.approved) {
      return res.status(403).json({
        success: false,
        message: "Your account is pending admin approval.",
      });
    }
    if (driverProfile.status !== "active") {
      return res.status(403).json({
        success: false,
        message: "Driver account is not active.",
      });
    }

    // 5️⃣ Check lock status
    if (user.lockUntil && new Date(user.lockUntil) > new Date()) {
      return res.status(423).json({
        success: false,
        message: "Account locked. Try again later.",
      });
    }

    // 6️⃣ Validate password
    if (!user.password) {
      return res.status(401).json({
        success: false,
        message: "Password not set. Please reset your account.",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      const failedAttempts = user.failedLoginAttempts + 1;
      let lockUntil = user.lockUntil;

      // Lock after 5 failed attempts
      if (failedAttempts >= 5) {
        lockUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: failedAttempts,
          lockUntil,
        },
      });

      return res.status(failedAttempts >= 5 ? 423 : 401).json({
        success: false,
        message:
          failedAttempts >= 5
            ? "Account locked due to too many failed login attempts."
            : "Incorrect email or password.",
      });
    }

    // 7️⃣ Reset failed attempts + update last login
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockUntil: null,
        lastLoginAt: new Date(),
      },
    });

    // 8️⃣ Generate tokens
    const accessToken = signAccessToken(user);
    const refreshTokenRaw = signRefreshToken(user);
    const hashedToken = await bcrypt.hash(refreshTokenRaw, 10);

    // Remove expired/old refresh tokens, keep last 4 valid ones
    const validTokens = user.refreshTokens
      .filter(
        (rt) => !rt.revoked && (!rt.expiresAt || new Date(rt.expiresAt) > new Date())
      )
      .slice(-4);

    await prisma.$transaction(async (tx) => {
      // Revoke all expired ones
      await tx.refreshToken.updateMany({
        where: {
          userId: user.id,
          OR: [
            { revoked: true },
            { expiresAt: { lt: new Date() } },
          ],
        },
        data: { revoked: true },
      });

      // Add new refresh token
      await tx.refreshToken.create({
        data: {
          userId: user.id,
          token: hashedToken,
          revoked: false,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
    });

    // 9️⃣ Set cookies
    setAppCookie(res, "driverAccessToken", accessToken, {
      maxAge: 15 * 60 * 1000, // 15 mins
      path: "/api/driver",
    });

    setAppCookie(res, "driverRefreshToken", refreshTokenRaw, {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: "/api/driver",
    });

    // 🔟 Respond success
    return res.status(200).json({
      success: true,
      message: "Login successful",
      roles,
      driverId: driverProfile.id,
    });
  } catch (error) {
    console.error("Driver login error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
    });
  }
};
const getDriverProfile = async (req, res) => {
  try {
    const userId = req.user?.id; // Prisma uses numeric IDs (Int)

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized: No user found" });
    }

    // 🔍 Find driver profile + include the linked user
    const driverProfile = await prisma.driverProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
    });

    if (!driverProfile) {
      return res
        .status(404)
        .json({ success: false, message: "Driver profile not found" });
    }

    // 🧾 Flatten payload for frontend
    const response = {
      success: true,
      driver: {
        id: driverProfile.id,
        name: driverProfile.user.name,
        email: driverProfile.user.email,
        avatar: driverProfile.user.avatar,
        phone: driverProfile.phone,
        licenseNumber: driverProfile.licenseNumber,
        vehicleType: driverProfile.vehicleType,
        model: driverProfile.model,
        registrationNumber: driverProfile.registrationNumber,
        capacity: driverProfile.capacity,
        status: driverProfile.status,
        approved: driverProfile.approved,
        rating: driverProfile.rating,
        totalRides: driverProfile.totalRides,
        isAvailable: driverProfile.isAvailable,
        createdAt: driverProfile.createdAt,
        updatedAt: driverProfile.updatedAt,
      },
    };

    res.json(response);
  } catch (error) {
    console.error("❌ Error fetching driver profile:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching driver profile",
      error: error.message,
    });
  }
};

const updateDriverProfile = async (req, res) => {
  try {
    const userId = req.user?.id; // Prisma uses Int IDs
    const updates = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized: no user found" });
    }

    // ✅ Fetch the driver profile and user in one go
    const existingProfile = await prisma.driverProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
    });

    if (!existingProfile) {
      return res.status(404).json({
        success: false,
        message: "Driver profile not found",
      });
    }

    // ✅ Prepare updates for both user and driverProfile
    const userUpdates = {};
    const profileUpdates = {};

    if (updates.name) userUpdates.name = updates.name;
    if (updates.email) userUpdates.email = updates.email;
    if (updates.phone) profileUpdates.phone = updates.phone;
    if (updates.availability !== undefined) profileUpdates.isAvailable = updates.availability;

    // ✅ Handle avatar upload (if file provided)
    if (req.file) {
      userUpdates.avatar = req.file.path;
    }

    // ✅ Update both records inside a transaction for consistency
    const [updatedUser, updatedProfile] = await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: userUpdates,
      }),
      prisma.driverProfile.update({
        where: { userId },
        data: profileUpdates,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
            },
          },
        },
      }),
    ]);

    return res.json({
      success: true,
      driverProfile: {
        ...updatedProfile,
        user: updatedUser,
      },
    });
  } catch (error) {
    console.error("❌ Error updating driver profile:", error);
    res.status(500).json({
      success: false,
      message: "Update failed",
      error: error.message,
    });
  }
};

// ========== DELETE: Delete Driver Profile ==========
const deleteDriverProfile = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: user not found",
      });
    }

    // ✅ Check if the driver profile exists first
    const existingProfile = await prisma.driverProfile.findUnique({
      where: { userId },
    });

    if (!existingProfile) {
      return res.status(404).json({
        success: false,
        message: "Driver profile not found",
      });
    }

    // ✅ Delete profile & remove DRIVER role atomically
    await prisma.$transaction(async (tx) => {
      await tx.driverProfile.delete({
        where: { userId },
      });

      await tx.userRoleAssignment.deleteMany({
        where: {
          userId,
          role: "DRIVER",
        },
      });
    });

    return res.json({
      success: true,
      message: "Driver profile deleted successfully",
    });
  } catch (error) {
    console.error("❌ Error deleting driver profile:", error);
    return res.status(500).json({
      success: false,
      message: "Delete failed",
      error: error.message,
    });
  }
};
// ========== FORGOT PASSWORD ==========
const forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    // ✅ Check if user exists and has DRIVER role
    const user = await prisma.user.findFirst({
      where: {
        email,
        roleAssignments: {
          some: { role: "DRIVER" },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "Driver not found" });
    }

    // ✅ Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // ✅ Update user record
    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken, resetTokenExpires },
    });

    // ✅ Verify SMTP credentials
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      throw new Error("SMTP credentials are missing");
    }

    // ✅ Configure transporter
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const resetLink = `${process.env.FRONTEND_URL}/driver/reset-password/${resetToken}`;

    // ✅ Send reset email
    await transporter.sendMail({
      from: `"GoOn Support" <${process.env.SMTP_USER}>`,
      to: user.email,
      subject: "Driver Password Reset",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;">
          <h2>Password Reset Request</h2>
          <p>Hello ${user.name || "Driver"},</p>
          <p>You requested a password reset. Click the button below to reset your password:</p>
          <a href="${resetLink}"
             style="display:inline-block;padding:10px 20px;background:#007bff;color:#fff;
             text-decoration:none;border-radius:5px;">Reset Password</a>
          <p>This link will expire in 1 hour.</p>
          <hr />
          <small>If you didn’t request this, please ignore this email.</small>
        </div>
      `,
    });

    res.json({ success: true, message: "Password reset email sent ✅" });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to send password reset email",
    });
  }
};
// ========== RESET PASSWORD (Driver) ==========
const resetPassword = async (req, res) => {
  const { token } = req.params;
  const { newPassword } = req.body;

  try {
    // ✅ Find user with matching token and valid expiration
    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpires: { gt: new Date() },
        roleAssignments: {
          some: { role: "DRIVER" },
        },
      },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired password reset link",
      });
    }

    // ✅ Update password and clear reset fields
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: newPassword, // Hash if using bcrypt middleware or manual hash
        resetToken: null,
        resetTokenExpires: null,
      },
    });

    res.json({
      success: true,
      message: "Password reset successful. You can now log in.",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Password reset failed",
    });
  }
};

const getDriverRides = async (req, res) => {
  try {
    const driverId = req.user.id;

    const rides = await prisma.ride.findMany({
      where: { driverId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        pickup: true,
        destination: true,
        price: true,
        selectedDate: true,
        selectedTime: true,
        capacity: true,
        maxPassengers: true,
        type: true,
        currency: true,
        status: true,
      },
    });

    return res.json({ success: true, rides });
  } catch (error) {
    console.error("Error fetching driver rides:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch rides",
    });
  }
};

// =====================
// GET RIDE BY ID
// =====================
const getRideById = async (req, res) => {
  try {
    const driverId = req.user.id;
    const rideId = parseInt(req.params.id, 10);

    const ride = await prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        driver: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!ride) {
      return res.status(404).json({ success: false, message: "Ride not found" });
    }

    if (ride.driverId !== driverId) {
      return res.status(403).json({ success: false, message: "Unauthorized access" });
    }

    res.json({ success: true, ride });
  } catch (error) {
    console.error("Error fetching ride by ID:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


// =====================
// DELETE RIDE
// =====================
const deleteRide = async (req, res) => {
  try {
    const driverId = req.user.id;
    const rideId = parseInt(req.params.id, 10);

    const ride = await prisma.ride.findUnique({
      where: { id: rideId },
    });

    if (!ride) {
      return res.status(404).json({ success: false, message: "Ride not found" });
    }

    if (ride.driverId !== driverId) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    await prisma.ride.delete({ where: { id: rideId } });

    res.json({ success: true, message: "Ride deleted successfully" });
  } catch (error) {
    console.error("Error deleting ride:", error);
    res.status(500).json({ success: false, message: "Failed to delete ride" });
  }
};


const updateRide = async (req, res) => {
  try {
    const rideId = Number(req.params.id);

    // 1️⃣ Find the ride and ensure it belongs to this driver
    const ride = await prisma.ride.findUnique({
      where: { id: rideId },
      include: { driver: true },
    });

    if (!ride) {
      return res.status(404).json({ success: false, message: "Ride not found" });
    }

    if (ride.driverId !== req.user.id) {
      return res.status(403).json({ success: false, message: "Not authorized to edit this ride" });
    }

    // 2️⃣ Get the latest active commission config
    const cfg = await prisma.commissionConfig.findFirst({
      where: { active: true },
      orderBy: { effectiveFrom: "desc" },
    });
    const rate = cfg?.rate ?? ride.commissionRate;

    // 3️⃣ Prepare updates
    const allowedUpdates = [
      "pickup",
      "destination",
      "price",
      "currency",
      "description",
      "selectedDate",
      "selectedTime",
      "capacity",
      "maxPassengers",
      "type",
      "status",
    ];

    const updates = {};

  const numericFields = ["price", "capacity", "maxPassengers"];

    allowedUpdates.forEach((field) => {
  if (req.body[field] !== undefined) {
    if (numericFields.includes(field)) {
      updates[field] = parseFloat(req.body[field]);
    } else if (field === "selectedDate") {
      // Normalize to full ISO date
      updates[field] = new Date(req.body[field]);
    } else {
      updates[field] = req.body[field];
    }
  }
});

if (req.body.selectedDate && req.body.selectedTime) {
  const dateTimeString = `${req.body.selectedDate}T${req.body.selectedTime}:00Z`;
  updates.selectedDate = new Date(dateTimeString);
}


    // Handle optional image update
    if (req.file) {
      updates.imageUrl = req.file.path;
    }

    // 4️⃣ Recalculate commission if price changed
    if (req.body.price !== undefined) {
      const price = parseFloat(req.body.price);
      updates.commissionRate = rate;
      updates.commissionAmount = +(price * rate).toFixed(2);
      updates.payoutAmount = +(price * (1 - rate)).toFixed(2);
    }

    // 5️⃣ (Optional) Re-geocode pickup/destination
    if (req.body.pickup || req.body.destination) {
      const [newPickup, newDest] = await Promise.all([
        req.body.pickup ? geocodeAddress(req.body.pickup) : null,
        req.body.destination ? geocodeAddress(req.body.destination) : null,
      ]);

      if (newPickup) {
        updates.pickupNorm = `${newPickup.latitude},${newPickup.longitude}`;
      }
      if (newDest) {
        updates.destinationNorm = `${newDest.latitude},${newDest.longitude}`;
      }
    }

    // 6️⃣ Update ride
    const updatedRide = await prisma.ride.update({
      where: { id: rideId },
      data: updates,
    });

    return res.json({
      success: true,
      message: "Ride updated successfully",
      ride: updatedRide,
    });
  } catch (error) {
    console.error("Error in updateRide:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};
const updateRideStatusDriver = async (req, res) => {
  try {
    const { rideId, status } = req.body;

    // 1️⃣ Validate input
    if (!rideId || !status) {
      return res.status(400).json({ success: false, message: "Ride ID and status are required" });
    }

    // 2️⃣ Find ride and ensure the driver owns it
    const ride = await prisma.ride.findUnique({
      where: { id: Number(rideId) },
      select: { id: true, driverId: true, status: true },
    });

    if (!ride) {
      return res.status(404).json({ success: false, message: "Ride not found" });
    }

    if (ride.driverId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to update this ride",
      });
    }

    // 3️⃣ Update the ride status
    const updatedRide = await prisma.ride.update({
      where: { id: Number(rideId) },
      data: {
        status,
        updatedAt: new Date(),
      },
    });

    // 4️⃣ (Optional) Add Activity Log entry
    await prisma.activityLog.create({
      data: {
        userId: req.user.id,
        role: "DRIVER",
        action: "UPDATE_RIDE_STATUS",
        description: `Driver updated ride #${rideId} status to ${status}`,
        req,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Ride status updated successfully",
      ride: updatedRide,
    });
  } catch (error) {
    console.error("Error updating ride status:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};
const addRide = async (req, res) => {
  try {
    // (1) Validate uploaded image
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Image is required",
      });
    }

    // (2) Find active commission config
    const commissionConfig = await prisma.commissionConfig.findFirst({
      where: { active: true },
      orderBy: { effectiveFrom: "desc" },
    });
    const rate = commissionConfig?.rate ?? 0;

    // (3) Geocode pickup & destination
    const pickupCoords = await geocodeAddress(req.body.pickup);
    const destCoords = await geocodeAddress(req.body.destination);

    // (4) Verify driver role
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const isDriver = await prisma.userRoleAssignment.findFirst({
      where: { userId: user.id, role: "DRIVER" },
    });
    if (!isDriver) {
      return res
        .status(403)
        .json({ success: false, message: "Access denied: Not a driver." });
    }

    // (5) Validate capacity and passenger limits
    const capacity = Number(req.body.capacity);
    const maxPassengers = Number(req.body.maxPassengers);

    if (maxPassengers > capacity) {
      return res.status(400).json({
        success: false,
        message: "maxPassengers cannot exceed total capacity",
      });
    }

    // (6) Create ride
    const price = Number(req.body.price);
    const commissionAmount = +(price * rate).toFixed(2);
    const payoutAmount = +(price * (1 - rate)).toFixed(2);

    const ride = await prisma.ride.create({
      data: {
        pickup: req.body.pickup,
        destination: req.body.destination,
        pickupNorm: req.body.pickup.trim().toLowerCase(),
        destinationNorm: req.body.destination.trim().toLowerCase(),
        price,
        currency: req.body.currency || "USD",
        description: req.body.description,
        selectedDate: new Date(req.body.selectedDate),
        selectedTime: req.body.selectedTime,
        capacity,
        maxPassengers,
        imageUrl: req.file.path,
        type: req.body.type,
        status: req.body.status?.toUpperCase() || "PENDING_APPROVAL",
        driverId: user.id,
        commissionRate: rate,
        commissionAmount,
        payoutAmount,
      },
      include: {
        driver: {
          select: { id: true, name: true, email: true, avatar: true },
        },
      },
    });

    // (7) Respond
    return res.status(201).json({
      success: true,
      message: "Ride added successfully",
      ride,
    });
  } catch (error) {
    console.error("❌ Error in addRide:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

/**
 * GET /api/driver/commission-rate
 * Retrieves the current active commission rate.
 */
const getCommissionRate = async (req, res) => {
  const driverId = req.user?.id;
  try {
    const config = await prisma.commissionConfig.findFirst({
      where: { active: true },
      orderBy: { effectiveFrom: "desc" },
    });

    if (!config) {
      return res.json({ success: true, rate: 0 });
    }

          const log = await logActivity({
            userId: driverId,
            action: "GET_COMMISSION_RATE SUCCESS",
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
            userId: driverId,
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

const getCurrentRide = async (req, res) => {
  try {
    const user = req.user;

    // (1) Check if driver
    if (!user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const isDriver = await prisma.userRoleAssignment.findFirst({
      where: { userId: user.id, role: "DRIVER" },
    });

    if (!isDriver) {
      return res
        .status(403)
        .json({ success: false, message: "Access denied: Not a driver." });
    }

    // (2) Query for one active ride
    const activeStatuses = [
      "ASSIGNED",
      "IN_PROGRESS",
      "APPROVED",
      "PENDING_APPROVAL",
    ];

    const ride = await prisma.ride.findFirst({
      where: {
        driverId: user.id,
        status: { in: activeStatuses },
      },
      orderBy: { createdAt: "desc" },
      include: {
        driver: {
          select: { id: true, name: true, email: true, avatar: true },
        },
      },
    });

    if (!ride) {
      return res.status(200).json({
        success: true,
        ride: null,
        message: "No active ride found.",
      });
    }

    return res.status(200).json({ success: true, ride });
  } catch (error) {
    console.error("❌ Error fetching current ride:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};
const getCurrentRides = async (req, res) => {
  try {
    const user = req.user;

    // (1) Check if driver
    if (!user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const isDriver = await prisma.userRoleAssignment.findFirst({
      where: { userId: user.id, role: "DRIVER" },
    });

    if (!isDriver) {
      return res
        .status(403)
        .json({ success: false, message: "Access denied: Not a driver." });
    }

    // (2) Query all active rides assigned to driver
    const rides = await prisma.ride.findMany({
      where: {
        driverId: user.id,
        status: { in: ["ASSIGNED"] },
      },
      orderBy: { createdAt: "desc" },
      include: {
        driver: {
          select: { id: true, name: true, email: true, avatar: true },
        },
      },
    });

    if (!rides.length) {
      return res.status(200).json({
        success: true,
        rides: [],
        message: "No active rides found.",
      });
    }

    return res.status(200).json({ success: true, rides });
  } catch (error) {
    console.error("❌ Error fetching current rides:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};
const getDriverBookings = async (req, res) => {
  try {
    const driverId = req.user.id;

    // Find all bookings that include rides belonging to the driver
    const bookings = await prisma.booking.findMany({
      where: {
        rides: {
          // We store rides as JSON, so we filter manually after fetch
          not: prisma.JsonNull,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Filter rides manually (since Prisma can't filter inside JSON easily)
    const driverBookings = bookings
      .map((booking) => {
        const driverRides = (Array.isArray(booking.rides) ? booking.rides : [])
          .filter(
            (ride) =>
              ride.driver === driverId && ride.status?.toLowerCase() === "approved"
          );

        if (driverRides.length === 0) return null;

        return {
          id: booking.id,
          user: {
            id: booking.user.id,
            name: booking.user.name,
          },
          totalAmount: booking.amount,
          bookingStatus: booking.status,
          rides: driverRides,
        };
      })
      .filter(Boolean); // remove nulls

    return res.status(200).json({ success: true, data: driverBookings });
  } catch (error) {
    console.error("Error fetching driver bookings:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const startRide = async (req, res) => {
  try {
    const { rideId } = req.params;
    const driverId = req.user.id;

    // 1️⃣ Find the ride by ID and make sure the driver owns it
    const ride = await prisma.ride.findUnique({
      where: { id: Number(rideId) },
      include: {
        driver: true,
      },
    });

    if (!ride) {
      return res.status(404).json({ success: false, message: "Ride not found." });
    }

    if (ride.driverId !== driverId) {
      return res.status(403).json({ success: false, message: "Not authorized for this ride." });
    }

    if (ride.status !== "APPROVED") {
      return res.status(400).json({
        success: false,
        message: `Ride status is '${ride.status}', must be 'APPROVED' to start.`,
      });
    }

    // 2️⃣ Update the ride to "IN_PROGRESS"
    const updatedRide = await prisma.ride.update({
      where: { id: ride.id },
      data: {
        status: "IN_PROGRESS",
      },
    });

    // 3️⃣ Update the parent booking (if any)
    const booking = await prisma.booking.findFirst({
      where: {
        rides: {
          not: Prisma.JsonNull,
        },
      },
    });

    if (booking) {
      // Update the JSON array’s ride status manually (in JS)
      const updatedRides = booking.rides.map((r) =>
        r.id === ride.id ? { ...r, status: "in progress" } : r
      );

      const anyRideInProgress = updatedRides.some((r) => r.status === "in progress");
      const allRidesApproved = updatedRides.every(
        (r) => r.status === "approved" || r.status === "in progress"
      );

      let newStatus = booking.status;
      if (anyRideInProgress) newStatus = "IN_PROGRESS";
      else if (allRidesApproved) newStatus = "APPROVED";

      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          rides: updatedRides,
          status: newStatus,
        },
      });

      // 🔔 Emit socket event
      io.to(String(booking.userId)).emit("rideStarted", {
        bookingId: booking.id,
        rideId: ride.id,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Ride started successfully.",
      ride: updatedRide,
    });
  } catch (err) {
    console.error("Error starting ride:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

const completeRide = async (req, res) => {
  try {
    const { rideId } = req.params;
    const driverId = req.user.id;

    // 1️⃣ Find the ride
    const ride = await prisma.ride.findUnique({
      where: { id: Number(rideId) },
    });

    if (!ride || ride.driverId !== driverId) {
      return res
        .status(404)
        .json({ success: false, message: "Ride not found or not assigned to this driver." });
    }

    if (ride.status !== "IN_PROGRESS") {
      return res.status(400).json({
        success: false,
        message: "Cannot complete a ride that is not in progress.",
      });
    }

    // 2️⃣ Update ride status to completed
    const updatedRide = await prisma.ride.update({
      where: { id: ride.id },
      data: { status: "COMPLETED" },
    });

    // 3️⃣ Find related booking and update JSON + status
    const booking = await prisma.booking.findFirst({
      where: {
        rides: {
          not: Prisma.JsonNull,
        },
      },
    });

    if (booking) {
      const updatedRides = booking.rides.map((r) =>
        r.id === ride.id ? { ...r, status: "completed" } : r
      );

      const allCompleted = updatedRides.every((r) => r.status === "completed");

      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          rides: updatedRides,
          status: allCompleted ? "COMPLETED" : booking.status,
        },
      });

      io.to(String(booking.userId)).emit("rideCompleted", {
        bookingId: booking.id,
        rideId: ride.id,
        fare: booking.amount,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Ride completed successfully.",
      ride: updatedRide,
    });
  } catch (error) {
    console.error("Error completing ride:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};
// POST /api/driver/ride/cancel
// Allows a driver to cancel a ride if it hasn't been completed.
const cancelRide = async (req, res) => {
  try {
    const driverId = req.user?.id;
    if (!driverId) {
      return res.status(403).json({ success: false, message: "Access denied: Not a driver." });
    }

    const { rideId } = req.body;

    const ride = await prisma.ride.findUnique({ where: { id: Number(rideId) } });
    if (!ride) {
      return res.status(404).json({ success: false, message: "Ride not found." });
    }

    if (ride.driverId !== driverId) {
      return res.status(403).json({ success: false, message: "Not authorized to cancel this ride." });
    }

    if (ride.status === "COMPLETED") {
      return res.status(400).json({ success: false, message: "Completed rides cannot be cancelled." });
    }

    const updatedRide = await prisma.ride.update({
      where: { id: ride.id },
      data: { status: "CANCELLED" },
    });

    return res.status(200).json({
      success: true,
      message: "Ride cancelled successfully.",
      ride: updatedRide,
    });
  } catch (error) {
    console.error("Error cancelling ride:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

const getUpcomingRides = async (req, res) => {
  try {
    const driverId = req.user?.id;
    if (!driverId) {
      return res.status(403).json({ success: false, message: "Access denied: Not a driver." });
    }

    const now = new Date();

    const rides = await prisma.ride.findMany({
      where: {
        driverId,
        status: "SCHEDULED",
        selectedDate: { gte: now },
      },
      orderBy: { selectedDate: "asc" },
    });

    return res.status(200).json({
      success: true,
      rides,
    });
  } catch (error) {
    console.error("Error fetching upcoming rides:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

const getDriverEarnings = async (req, res) => {
  try {
    const driverId = req.user?.id;
    if (!driverId) {
      return res.status(403).json({ success: false, message: "Access denied: Not a driver." });
    }

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [today, week, month] = await Promise.all([
      prisma.ride.aggregate({
        _sum: { price: true },
        where: {
          driverId,
          status: "COMPLETED",
          updatedAt: {
            gte: startOfDay,
            lt: new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000),
          },
        },
      }),
      prisma.ride.aggregate({
        _sum: { price: true },
        where: {
          driverId,
          status: "COMPLETED",
          updatedAt: {
            gte: startOfWeek,
            lt: new Date(startOfWeek.getTime() + 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      prisma.ride.aggregate({
        _sum: { price: true },
        where: {
          driverId,
          status: "COMPLETED",
          updatedAt: {
            gte: startOfMonth,
            lt: new Date(now.getFullYear(), now.getMonth() + 1, 1),
          },
        },
      }),
    ]);

    return res.status(200).json({
      success: true,
      earnings: {
        today: today._sum.price || 0,
        week: week._sum.price || 0,
        month: month._sum.price || 0,
      },
    });
  } catch (error) {
    console.error("Error fetching driver earnings:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

const getPerformanceMetrics = async (req, res) => {
  try {
    const user = req.user;
    const roles = user.roleAssignments.map((r) => r.role);
    if (!user || !roles?.includes("DRIVER")) {
      return res.status(403).json({ success: false, message: "Access denied: Not a driver." });
    }

    const driverId = user.id;

    const metrics = await prisma.ride.aggregate({
      _count: { _all: true },
      _avg: { price: true },
      _sum: { price: true },
      where: {
        driverId,
        status: "COMPLETED",
      },
    });

    const result = {
      totalCompleted: metrics._count._all || 0,
      averageFare: metrics._avg.price || 0,
      averageDuration:  null,
      totalFare: metrics._sum.price || 0,
    };

    return res.status(200).json({ success: true, metrics: result });
  } catch (error) {
    console.error("Error fetching performance metrics:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};
const getDriverHistory = async (req, res) => {
  try {
    const driver = req.user;
    if (!driver || !driver.roles?.includes("DRIVER")) {
      return res.status(403).json({ success: false, message: "Access denied: Not a driver." });
    }

    const rides = await prisma.ride.findMany({
      where: {
        driverId: driver.id,
        status: { in: ["COMPLETED", "CANCELLED"] },
      },
      orderBy: { selectedDate: "desc" },
    });

    return res.status(200).json({ success: true, rides });
  } catch (error) {
    console.error("Error fetching ride history:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};
const getDriverEarningsReport = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.roles?.includes("DRIVER")) {
      return res.status(403).json({ success: false, message: "Access denied: Not a driver." });
    }

    const driverId = user.id;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get all completed rides in last 30 days
    const rides = await prisma.ride.findMany({
      where: {
        driverId,
        status: "COMPLETED",
        updatedAt: { gte: thirtyDaysAgo },
      },
      select: {
        price: true,
        updatedAt: true,
      },
    });

    // Group earnings per day
    const reportMap = {};
    rides.forEach((r) => {
      const dateKey = r.updatedAt.toISOString().split("T")[0];
      if (!reportMap[dateKey]) {
        reportMap[dateKey] = { totalEarnings: 0, rideCount: 0 };
      }
      reportMap[dateKey].totalEarnings += r.price;
      reportMap[dateKey].rideCount += 1;
    });

    const report = Object.entries(reportMap)
      .map(([date, { totalEarnings, rideCount }]) => ({
        date,
        totalEarnings,
        rideCount,
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    return res.status(200).json({ success: true, report });
  } catch (error) {
    console.error("Error fetching earnings report:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// In DriverController.js (or SupportController.js)
const submitSupportRequest = async (req, res) => {
  try {
    const driver = req.user;
    if (!driver || !driver.roles?.includes("DRIVER")) {
      return res.status(403).json({ success: false, message: "Access denied: Not a driver." });
    }

    const { subject, message } = req.body;
    if (!subject || !message) {
      return res.status(400).json({ success: false, message: "Subject and message are required." });
    }

    // Optional: log to a future SupportTicket table or admin notification
    console.log(`📩 Support request from driver ${driver.id} (${driver.name})`);
    console.log(`Subject: ${subject}`);
    console.log(`Message: ${message}`);

    await prisma.notification.create({
       data: {
         userId: driver.id,
         title: `Support Request: ${subject}`,
         body: message,
         type: "SYSTEM",
         status: "PENDING",
       },
     });

    return res.status(200).json({
      success: true,
      message: "Support request submitted successfully.",
    });
  } catch (error) {
    console.error("Error submitting support request:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};
 const updateRideFare = async (req, res) => {
  try {
    const driver = req.user; // using req.user instead of req.driver for consistency
    if (!driver || !driver.roles?.includes("DRIVER")) {
      return res.status(403).json({
        success: false,
        message: "Access denied: Not a driver.",
      });
    }

    const { rideId, newFare } = req.body;
    if (!rideId || newFare == null) {
      return res.status(400).json({
        success: false,
        message: "Ride ID and new fare are required.",
      });
    }

    // Find the ride by ID
    const ride = await prisma.ride.findUnique({
      where: { id: Number(rideId) },
    });

    if (!ride) {
      return res
        .status(404)
        .json({ success: false, message: "Ride not found." });
    }

    // Ensure the ride is assigned to this driver
    if (ride.driverId !== driver.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this ride.",
      });
    }

    // Only allow fare updates when ride is ASSIGNED or SCHEDULED
    if (
      ![RideStatus.ASSIGNED, RideStatus.SCHEDULED].includes(ride.status)
    ) {
      return res.status(400).json({
        success: false,
        message: "Fare cannot be updated at this stage.",
      });
    }

    // Record fare change in FareHistory
    await prisma.fareHistory.create({
      data: {
        rideId: ride.id,
        previousFare: ride.price,
        updatedFare: Number(newFare),
        calculatedExpectedFare: ride.price,
      },
    });

    // Update the fare in the ride
    const updatedRide = await prisma.ride.update({
      where: { id: ride.id },
      data: { price: Number(newFare) },
    });

    return res.status(200).json({
      success: true,
      message: "Fare updated successfully.",
      ride: updatedRide,
    });
  } catch (error) {
    console.error("Error updating ride fare:", error);
    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};

const driverRespondToRide = async (req, res) => {
  try {
    const { rideId, response } = req.body;
    const driverProfile = req.driverProfile;
    const user = req.user;

    if (!driverProfile || !user) {
      return res
        .status(401)
        .json({ success: false, message: "Driver authentication failed" });
    }

    // 1️⃣ Find ride
    const ride = await prisma.ride.findUnique({ where: { id: Number(rideId) } });
    if (!ride)
      return res
        .status(404)
        .json({ success: false, message: "Ride not found" });

    // 2️⃣ Check driver owns the ride
    if (ride.driverId !== user.id)
      return res
        .status(403)
        .json({ success: false, message: "Not authorized for this ride" });

    // 3️⃣ Only pending approval rides can be updated
    if (ride.status !== "PENDING_APPROVAL") {
      return res.status(400).json({
        success: false,
        message: `Ride has already been ${ride.status.toLowerCase()}`,
      });
    }

    // 4️⃣ Count total approved rides for this driver (to block full)
    const approvedCount = await prisma.ride.count({
      where: {
        driverId: user.id,
        status: "APPROVED",
      },
    });

    if (
      response === "approved" &&
      approvedCount + 1 > driverProfile.maxPassengers
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Cannot approve — ride is full" });
    }

    // 5️⃣ Update the ride status
    const updatedRide = await prisma.ride.update({
      where: { id: ride.id },
      data: { status: response === "approved" ? "APPROVED" : "DECLINED" },
    });

    // 6️⃣ Notify the passenger
    const booking = await prisma.booking.findFirst({
      where: { rides: { path: "$[*].id", array_contains: ride.id } },
    });

    if (booking) {
      const bookingUser = await prisma.user.findUnique({
        where: { id: booking.userId },
      });

      const title =
        response === "approved" ? "Ride Approved" : "Ride Declined";
      const body =
        response === "approved"
          ? `Hi ${bookingUser.name}, your ride from ${ride.pickup} to ${ride.destination} has been approved.`
          : `Hi ${bookingUser.name}, your ride from ${ride.pickup} to ${ride.destination} was declined.`;

      // ➤ Queue notification job
      await notificationQueue.add("ride-response", {
        userId: booking.userId.toString(),
        title,
        body,
        data: { rideId: ride.id.toString(), bookingId: booking.id.toString(), type: response },
        scheduledAt: new Date(),
      });

      // ➤ Emit via Socket.IO
      io.to(booking.userId.toString()).emit("rideResponseUpdate", {
        ride: updatedRide,
        response,
      });

      // ➤ Send FCM push
      if (bookingUser?.fcmToken) {
        await sendPushNotification(bookingUser.fcmToken, {
          title,
          body,
          data: {
            rideId: ride.id.toString(),
            bookingId: booking.id.toString(),
            type: title,
            url: "/myBookings",
            tag: "ride-response",
          },
        });
      }

      // ➤ Create Notification record
      await prisma.notification.create({
        data: {
          userId: booking.userId,
          rideId: ride.id,
          title,
          body,
          message: body,
          type: "RIDE_RESPONSE",
        },
      });
    }

    // 7️⃣ Broadcast if ride now full
    const totalApproved = await prisma.ride.count({
      where: { driverId: user.id, status: "APPROVED" },
    });

    if (response === "approved" && totalApproved >= driverProfile.maxPassengers) {
      const room = `search_${ride.pickupNorm}_${ride.destinationNorm}_${ride.selectedDate
        .toISOString()
        .split("T")[0]}`;
      io.to(room).emit("rideFull", { rideId: ride.id });
    }

    return res.status(200).json({
      success: true,
      message: `Ride ${response} successfully`,
      ride: updatedRide,
    });
  } catch (err) {
    console.error("Error in driverRespondToRide:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const arriveAtPickup = async (req, res) => {
  try {
    const { rideId } = req.body;

    const ride = await prisma.ride.findUnique({ where: { id: Number(rideId) } });
    if (!ride)
      return res
        .status(404)
        .json({ success: false, message: "Ride not found" });

    // Update ride + related booking
    const updatedRide = await prisma.ride.update({
      where: { id: ride.id },
      data: { status: "ARRIVED" },
    });

    await prisma.booking.updateMany({
      where: { rides: { path: "$[*].id", array_contains: ride.id } },
      data: { status: "DRIVER_EN_ROUTE" },
    });

    // Emit socket updates
    io.to(updatedRide.driverId.toString()).emit("arrivedConfirmed", { rideId });
    io.to(updatedRide.driverId.toString()).emit("rideArrived", { rideId });

    // Send push to passenger
    const booking = await prisma.booking.findFirst({
      where: { rides: { path: "$[*].id", array_contains: ride.id } },
    });

    if (booking) {
      const bookingUser = await prisma.user.findUnique({
        where: { id: booking.userId },
      });

      if (bookingUser?.fcmToken) {
        await sendPushNotification(bookingUser.fcmToken, {
          title: "Driver Arrived",
          body: `Your driver has arrived at ${ride.pickup}`,
          data: {
            rideId: ride.id.toString(),
            bookingId: booking.id.toString(),
            url: "/myBookings",
            tag: "driver-arrived",
          },
        });
      }

      await prisma.notification.create({
        data: {
          userId: booking.userId,
          rideId: ride.id,
          title: "Driver Arrived",
          body: `Your driver has arrived at ${ride.pickup}`,
          type: "RIDE_RESPONSE",
        },
      });
    }

    return res.json({
      success: true,
      message: "Driver has arrived at pickup",
      ride: updatedRide,
    });
  } catch (err) {
    console.error("Error in arriveAtPickup:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
const getPendingRideRequests = async (req, res) => {
  try {
    const driverProfile = req.driverProfile;
    const user = req.user;

    if (!driverProfile || !user) {
      return res.status(401).json({ success: false, message: "Driver authentication failed" });
    }

    console.log("✅ Getting pending requests for driver:", user.id);

    // ✅ Find all bookings with rides belonging to this driver that need approval
    const bookings = await prisma.booking.findMany({
      where: {
        rides: {
          some: {
            driverId: user.id,
            status: "pending approval"
          }
        }
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        },
        rides: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    // ✅ Extract rides belonging to this driver and still pending approval
    const pendingRides = bookings.flatMap(booking => {
      const driverRides = booking.rides.filter(
        ride =>
          ride.driverId === user.id &&
          ride.status === "pending approval"
      );

      return driverRides.map(ride => ({
        ...ride,
        bookingId: booking.id,
        bookedBy: booking.user,
        bookingDate: booking.createdAt
      }));
    });

    console.log(`Found ${pendingRides.length} pending ride requests for driver ${user.id}`);

    return res.status(200).json({
      success: true,
      message: "Pending ride requests retrieved successfully",
      rides: pendingRides
    });

  } catch (error) {
    console.error("Error fetching pending ride requests:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// --- DRIVER REFRESH TOKEN FLOW (plain tokens, not hashed) ---
const driverTokenRefresh = async (req, res) => {
  const refreshToken = req.cookies.driverRefreshToken;
  if (!refreshToken) return res.status(401).json({ message: "No refresh token." });

  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: { 
        roleAssignments: true, 
        refreshTokens: true,
        driverProfile: true 
      }
    });

    if (!user || !user.roleAssignments.some(r => r.role === "DRIVER")) {
      return res.status(401).json({ message: "Driver not found." });
    }

    if (!user.driverProfile) {
      return res.status(401).json({ message: "Driver profile not found." });
    }

    // ✅ Validate refresh token
    let valid = false;
    for (const rt of user.refreshTokens) {
      if (rt.revoked) continue;
      if (rt.expiresAt && rt.expiresAt <= new Date()) continue;
      if (await bcrypt.compare(refreshToken, rt.token)) {
        valid = true;
        break;
      }
    }

    if (!valid) {
      return res.status(401).json({ code: "REFRESH_INVALID", message: "Invalid or expired refresh token." });
    }

    // ✅ Issue new tokens
    const newAccessToken = signAccessToken(user);
    const newRefreshToken = signRefreshToken(user);
    const newHashed = await bcrypt.hash(newRefreshToken, 10);

    const activeTokens = user.refreshTokens
      .filter(rt => !rt.revoked && (!rt.expiresAt || rt.expiresAt > new Date()))
      .slice(-4);

    await prisma.refreshToken.deleteMany({
      where: {
        userId: user.id,
        OR: [{ revoked: true }, { expiresAt: { lte: new Date() } }]
      }
    });

    await prisma.refreshToken.create({
      data: {
        token: newHashed,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        revoked: false,
        userId: user.id
      }
    });

    setAppCookie(res, "driverRefreshToken", newRefreshToken, {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/api/driver"
    });
    setAppCookie(res, "driverAccessToken", newAccessToken, {
      maxAge: 15 * 60 * 1000,
      path: "/api/driver"
    });

    return res.json({ success: true, roles: user.roleAssignments.map(r => r.role), message: "Token refreshed" });

  } catch (err) {
    if (err.name === "TokenExpiredError" || err.name === "JsonWebTokenError") {
      return res.status(403).json({ code: "JWT_INVALID", message: "Invalid refresh token." });
    }
    logger.error("Refresh token internal error", err);
    return res.status(500).json({ code: "REFRESH_INTERNAL", message: "Server error during refresh." });
  }
};
const driverLogout = async (req, res) => {
  const refreshToken = req.cookies?.driverRefreshToken;

  if (refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);

      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        include: { refreshTokens: true }
      });

      if (user && user.refreshTokens.length) {
        for (const rt of user.refreshTokens) {
          if (rt.revoked) continue;
          if (await bcrypt.compare(refreshToken, rt.token)) {
            await prisma.refreshToken.update({
              where: { id: rt.id },
              data: { revoked: true }
            });
          }
        }
      }
    } catch (err) {
      console.warn("Logout: token verify/revoke failed (continuing):", err.message);
    }
  }

  clearMultipleCookies(res, ["driverAccessToken", "driverRefreshToken"]);
  return res.status(200).json({ success: true, message: "Logged out." });
};

export { 
  getDriverRides, 
  getRideById,
  deleteRide,
  updateRide,
  updateRideStatusDriver, 
  updateDriverProfile, 
  registerDriver, 
  formSubmitted,
  loginDriver,
  forgotPassword,
  resetPassword,
  addRide,
  getCommissionRate,
  getCurrentRide,
  getCurrentRides, 
  getDriverBookings,
  driverRespondToRide,
  arriveAtPickup,
  startRide, 
  completeRide, 
  cancelRide,  
  getUpcomingRides, 
  getDriverEarnings,
  scheduleRideReminder, 
  getPerformanceMetrics,  
  getDriverHistory,
  getDriverEarningsReport,  
  submitSupportRequest,
  updateRideFare,
  getPendingRideRequests,
  driverTokenRefresh,
  getDriverProfile,
  driverLogout,
  deleteDriverProfile,
}