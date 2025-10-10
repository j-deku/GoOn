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
  jwt.sign({ id: user._id, roles: user.roles }, process.env.JWT_SECRET, { expiresIn: "1d" });

const signRefreshToken = (user) =>
  jwt.sign({ id: user._id }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: "7d" });

const registerDriver = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      name, email, password,
      phone, licenseNumber,
      vehicleType, model,
      registrationNumber, capacity,
    } = req.body;

    // 1) Required fields
    if (
      !name || !email || !password ||
      !phone || !licenseNumber ||
      !vehicleType || !model ||
      !registrationNumber || !capacity
    ) {
      await session.abortTransaction();
      return res.status(422).json({
        success: false,
        message: "All driver fields are required."
      });
    }

    // 2) Validate email & password
    if (!validator.isEmail(email)) {
      await session.abortTransaction();
      return res.status(422).json({
        success: false,
        message: "Invalid email format."
      });
    }
    if (!validator.isStrongPassword(password, { minLength: 8 })) {
      await session.abortTransaction();
      return res.status(422).json({
        success: false,
        message: "Password must be ≥8 chars and include uppercase, lowercase & special character."
      });
    }

    // 3) Lookup existing user
    let user = await UserModel.findOne({ email }).session(session);

    if (user) {
      // 3a) If already a driver, conflict
      if (user.roles.includes("driver")) {
        await session.abortTransaction();
        return res.status(409).json({
          success: false,
          message: "A driver account with this email already exists. Please log in."
        });
      }

      // 3b) Else: upgrade them to driver (200 OK)
      user.roles.push("driver");
      if (!user.password) {
        const salt = await bcrypt.genSalt(10);
        user.password = password;
      }
      await user.save({ session });

      // Create driver profile
      const driverProfile = new DriverProfile({
        user: user._id,
        phone,
        licenseNumber,
        vehicle: { vehicleType, model, registrationNumber, capacity: Number(capacity) },
        status: "pending",
        approved: false,
      });
      await driverProfile.save({ session });

      await session.commitTransaction();
      return res.status(200).json({
        success: true,
        message: "Driver role added and profile created. Awaiting admin approval.",
        driver: {
          id: driverProfile._id,
          name: user.name,
          email: user.email,
          phone: driverProfile.phone,
        }
      });
    }

    // 3c) New user + driver role (201 Created)
    user = new UserModel({
      name,
      email,
      password,     // pre('save') will hash
      roles: ["driver"],
      verified: true,
    });
    await user.save({ session });

    const driverProfile = new DriverProfile({
      user: user._id,
      phone,
      licenseNumber,
      vehicle: { vehicleType, model, registrationNumber, capacity: Number(capacity) },
      status: "pending",
      approved: false,
    });
    await driverProfile.save({ session });

    await session.commitTransaction();
    return res.status(201).json({
      success: true,
      message: "Driver registration successful. Awaiting admin approval.",
      driver: {
        id: driverProfile._id,
        name: user.name,
        email: user.email,
        phone: driverProfile.phone,
      }
    });

  } catch (error) {
    // Handle duplicate-key race
    if (error.code === 11000 && error.keyPattern?.email) {
      await session.abortTransaction();
      return res.status(409).json({
        success: false,
        message: "This email is already in use. Please log in or use a different email."
      });
    }
    console.error("registerDriver error:", error);
    await session.abortTransaction();
    return res.status(500).json({
      success: false,
      message: "Server error registering driver."
    });
  } finally {
    session.endSession();
  }
};

const loginDriver = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Missing fields ➜ 422 Unprocessable Entity
    if (!email || !password) {
      return res.status(422).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    // 2. User not found or not a driver ➜ 401 Unauthorized
    const user = await UserModel.findOne({ email });
    if (!user || !user.roles.includes("driver")) {
      return res.status(401).json({
        success: false,
        message: "Not authorized as driver. Please register first.",
      });
    }

    // 3. Driver profile not found ➜ 404 Not Found
    const driverProfile = await DriverProfile.findOne({ user: user._id });
    if (!driverProfile) {
      return res.status(404).json({
        success: false,
        message: "Driver profile not found.",
      });
    }

    // 4. Driver not approved yet ➜ 403 Forbidden
    if (!driverProfile.approved) {
      return res.status(403).json({
        success: false,
        message: "Your account is pending admin approval.",
      });
    }

    // 5. Driver account inactive ➜ 403 Forbidden
    if (driverProfile.status !== "active") {
      return res.status(403).json({
        success: false,
        message: "Driver account is not active.",
      });
    }

    // 6. Locked account ➜ 423 Locked
    if (user.lockUntil && user.lockUntil > Date.now()) {
      return res.status(423).json({
        success: false,
        message: "Account locked. Try again later.",
      });
    }

    // 7. Check password ➜ 401 Unauthorized
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= 5) {
        user.lockUntil = Date.now() + 30 * 60 * 1000; // Lock for 30 minutes
        await user.save();
        return res.status(423).json({
          success: false,
          message: "Account locked due to too many failed login attempts.",
        });
      }

      await user.save();
      return res.status(401).json({
        success: false,
        message: "Incorrect email or password.",
      });
    }

    // 8. Reset login attempts
    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;

    // 9. Generate tokens
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
    await driverProfile.save();

    setAppCookie(res, "driverRefreshToken", refreshTokenRaw, {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path:"/api/driver",
    });

    setAppCookie(res, "driverAccessToken", accessToken, {
      maxAge: 15 * 60 * 1000,
      path:"/api/driver",
    });

    return res.status(200).json({
      success: true,
      message: "Login successful",
      roles: user.roles,
      driverId: driverProfile._id
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
  const driverProfile = await DriverProfile
    .findOne({ user: req.user._id })
    .populate("user", "-password -refreshTokens");

  if (!driverProfile) {
    return res.status(404).json({ success: false, message: "Driver profile not found" });
  }

  // send back a flat payload:
  res.json({
    success: true,
    driver: {
      id: driverProfile._id,
      name: req.user.name,
      email: req.user.email,
      avatar: req.user.avatar,
      phone: driverProfile.phone,
      vehicle: driverProfile.vehicle,
      // …any other fields you need
    }
  });
};

const updateDriverProfile = async (req, res) => {
  try {
    const updates = req.body;
    const userId = req.user._id;

    // Fetch the driver's profile and populate the user reference
    const driverProfile = await DriverProfile.findOne({ user: userId }).populate("user");

    if (!driverProfile) {
      return res.status(404).json({ success: false, message: "Driver profile not found" });
    }

    // Update fields on driverProfile
    if (updates.phone) driverProfile.phone = updates.phone;
    if (updates.availability !== undefined) driverProfile.availability = updates.availability;

    // Update fields on user
    if (updates.name) driverProfile.user.name = updates.name;
    if (updates.email) driverProfile.user.email = updates.email;

    // Optional: update avatar
    if (req.file) {
      driverProfile.user.avatar = req.file.path;
    }

    await driverProfile.user.save();
    await driverProfile.save();

    const updatedProfile = await driverProfile.populate("user", "-password -refreshTokens");

    res.json({ success: true, driverProfile: updatedProfile });
  } catch (error) {
    console.error("Error updating driver profile:", error);
    res.status(500).json({ success: false, message: "Update failed" });
  }
};

// ========== DELETE: Delete Driver Profile ==========
const deleteDriverProfile = async (req, res) => {
  try {
    await DriverProfile.findOneAndDelete({ user: req.user._id });
    await UserModel.findByIdAndUpdate(req.user._id, { $pull: { roles: "driver" } });
    res.json({ success: true, message: "Driver profile deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Delete failed" });
  }
};

// ========== FORGOT PASSWORD ==========
const forgotPassword = async (req, res) => {
  const { email } = req.body;
  try {
    const user = await UserModel.findOne({ email, roles: "driver" });
    if (!user) return res.status(404).json({ message: "Driver not found" });

    // Generate secure reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetToken = resetToken;
    user.resetTokenExpires = Date.now() + 60 * 60 * 1000; // 1 hour
    await user.save();

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
    const resetLink = `${process.env.FRONTEND_URL}/driver/reset-password/${resetToken}`;
    await transporter.sendMail({
      to: user.email,
      subject: "Driver Password Reset",
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

// ========== RESET PASSWORD ==========
const resetPassword = async (req, res) => {
  const { token } = req.params;
  const { newPassword } = req.body;
  try {
    const user = await UserModel.findOne({
      resetToken: token,
      resetTokenExpires: { $gt: Date.now() }
    });
    if (!user || !user.roles.includes("driver")) return res.status(400).json({ message: "Invalid or expired token" });

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

const getDriverRides = async (req, res) => {
  try {
    const rides = await RideModel.find({ driver: req.user._id })
      .sort({ createdAt: -1 })
      .select("pickup destination price selectedDate selectedTime passengers type currency status");
    return res.json({ rides });
  } catch (error) {
    console.error("Error fetching driver rides:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};
const getRideById = async (req, res) => {
  try {
    const ride = await RideModel.findById(req.params.id).select("-__v");
    if (!ride) return res.status(404).json({ success:false, message:"Ride not found" });
    if (ride.driver.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success:false, message:"Unauthorized" });
    }
    res.json({ success:true, ride });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success:false, message:"Server error" });
  }
};

const deleteRide = async (req, res) => {
  try {
    const ride = await RideModel.findById(req.params.id);
    if (!ride) return res.status(404).json({ success:false, message:"Ride not found" });
    if (ride.driver.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success:false, message:"Unauthorized" });
    }
    await ride.deleteOne();
    res.json({ success:true, message:"Ride deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success:false, message:"Server error" });
  }
};

const updateRide = async (req, res) => {
  try {
    const rideId = req.params.id;

    // 1. Find the ride and ensure it belongs to this driver
    const ride = await RideModel.findById(rideId);
    if (!ride) {
      return res.status(404).json({ success: false, message: "Ride not found" });
    }
    if (ride.driver.toString() !== req.driver._id.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized to edit this ride" });
    }

    const cfg = await CommissionModel.findOne({ active: true }).sort({ effectiveFrom: -1 });
    const rate = cfg?.rate ?? ride.commissionRate;

    // 2. If you allow updating the image:
    if (req.file) {
      ride.imageUrl = req.file.path;
    }

    // 3. Update allowed fields
    const allowedUpdates = [
      "pickup",
      "destination",
      "price",
      "currency",
      "description",
      "selectedDate",
      "selectedTime",
      "passengers",
      "type",
      "status",
    ];
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        ride[field] = req.body[field];
      }
    });

      if (req.body.price !== undefined) {
      ride.commissionRate   = rate;
      ride.commissionAmount = +(ride.price * rate).toFixed(2);
      ride.payoutAmount     = +(ride.price * (1 - rate)).toFixed(2);
    }

    // 4. (Optional) Re-geocode if pickup or destination changed
    if (req.body.pickup || req.body.destination) {
      const [newPickup, newDest] = await Promise.all([
        req.body.pickup ? geocodeAddress(req.body.pickup) : null,
        req.body.destination ? geocodeAddress(req.body.destination) : null,
      ]);
      if (newPickup) {
        ride.pickupLocation = {
          type: "Point",
          coordinates: [newPickup.longitude, newPickup.latitude],
        };
      }
      if (newDest) {
        ride.destinationLocation = {
          type: "Point",
          coordinates: [newDest.longitude, newDest.latitude],
        };
      }
    }

    // 5. Save and return the updated ride
    await ride.save();
    return res.json({ success: true, message: "Ride updated successfully", ride });

  } catch (error) {
    console.error("Error in updateRide:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

const updateRideStatusDriver = async (req, res) => {
  try {
    const { rideId, status } = req.body;
    const ride = await RideModel.findById(rideId);
    if (!ride) {
      return res.status(404).json({ success: false, message: "Ride not found" });
    }
    if (ride.driver.toString() !== req.driver._id.toString()) {
      return res.status(403).json({ success: false, message: "You are not authorized to update this ride" });
    }
    ride.status = status;
    await ride.save();
    return res.status(200).json({ success: true, message: "Ride status updated successfully", ride });
  } catch (error) {
    console.error("Error updating ride status:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// In your addRide function:
const addRide = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Image is required" });
    }

       const cfg = await CommissionModel.findOne({ active: true }).sort({ effectiveFrom: -1 });
      const rate = cfg?.rate ?? 0;

    // 1) Geocode addresses
    const pickupCoords = await geocodeAddress(req.body.pickup);
    const destCoords   = await geocodeAddress(req.body.destination);
    const { currency } = req.body;
    
      const user = req.user;
    if (!user || !user.roles.includes("driver")) {
      return res.status(403).json({ success: false, message: "Access denied: Not a driver." });
    }

    const { capacity, maxPassengers } = req.body;
    if (maxPassengers > capacity) {
      return res.status(400).json({
        success: false,
        message: "maxPassengers cannot exceed total capacity"
      });
    }
    const ride = new RideModel({
      pickup: req.body.pickup,
      destination: req.body.destination,
      price: Number(req.body.price),
      currency, 
      description: req.body.description,
      selectedDate: new Date(req.body.selectedDate),
      selectedTime: req.body.selectedTime,
      capacity:      Number(capacity),
      maxPassengers: Number(maxPassengers),
      imageUrl: req.file.path,
      type: req.body.type,
      status: req.body.status || "pending approval",
      driver: req.user.id,
      pickupLocation: {
        type: "Point",
        coordinates: [pickupCoords.longitude, pickupCoords.latitude],
      },
      destinationLocation: {
        type: "Point",
        coordinates: [destCoords.longitude, destCoords.latitude],
      },
      commissionRate: rate,
      commissionAmount: +(Number(req.body.price) * rate).toFixed(2),
      payoutAmount: +(Number(req.body.price) * (1 - rate)).toFixed(2),

    });

    // 3) Save (triggers validate → normalize → save)
    await ride.save();
    // convert to plain object so virtuals + defaults are in the JSON
    const rideObj = ride.toObject({ getters: true, versionKey: false });
    return res.json({
      success: true,
      message: "Ride added successfully",
      ride: rideObj
    });
  } catch (error) {
    console.error("Error in addRide:", error);
    if (error.name === "ValidationError") {
      const msgs = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ success: false, message: msgs.join("; ") });
    }
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

const getCurrentRide = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.roles.includes("driver")) {
      return res.status(403).json({ success: false, message: "Access denied: Not a driver." });
    }
    // Query for a ride in various statuses
    const ride = await RideModel.findOne({
      driver: user._id,
      status: { $in: ["assigned", "in progress", "approved", "pending approval"] },
    });
    if (!ride) {
      return res.status(200).json({ success: true, ride: null, message: "No active ride found." });
    }
    ride.save()
    return res.status(200).json({ success: true, ride });
  } catch (error) {
    console.error("Error fetching current ride:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const getCurrentRides = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.roles.includes("driver")) {
      return res.status(403).json({ success: false, message: "Access denied: Not a driver." });
    }
    // Retrieve all active rides assigned to the driver
    const rides = await RideModel.find({
      driver: user._id,
      status: { $in: ["assigned"] },
    });
    if (!rides || rides.length === 0) {
      // Return 200 with an empty array instead of a 404 error
      return res.status(200).json({ success: true, rides: [], message: "No active rides found." });
    }

    return res.status(200).json({ success: true, rides });
  } catch (error) {
    console.error("Error fetching current rides:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
const getDriverBookings = async (req, res) => {
    try {
        const driverId = req.user._id;

        const bookings = await BookingModel.aggregate([
            {
                $unwind: "$rides"
            },
            
            {
                $match: {
                    "rides.driver": driverId,
                    "rides.status": "approved"
                }
            },
            
            {
                $lookup: {
                    from: "users",
                    localField: "userId",
                    foreignField: "_id",
                    as: "user"
                }
            },
            
            {
                $unwind: "$user"
            },
            
            {
                $group: {
                    _id: "$_id", 
                    userId: { $first: "$user" },
                    totalAmount: { $first: "$totalAmount" },
                    bookingStatus: { $first: "$status" },
                    rides: { $push: "$rides" } 
                }
            },
            
            {
                $project: {
                    _id: 1,
                    userId: {
                        _id: "$userId._id",
                        name: "$userId.name",
                    },
                    totalAmount: 1,
                    bookingStatus: 1,
                    rides: 1
                }
            }
        ]);

        return res.status(200).json({ success: true, data: bookings });

    } catch (err) {
        console.error("Error fetching driver bookings:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

const startRide = async (req, res) => {
    try {
        const { rideId } = req.params;
        const driverId = req.user._id; 

        const booking = await BookingModel.findOne({ "rides._id": rideId });

        if (!booking) {
            return res.status(404).json({ success: false, message: "Booking not found." });
        }

        const ride = booking.rides.id(rideId);

        if (!ride) {
            return res.status(404).json({ success: false, message: "Ride not found in booking." });
        }
        if (ride.driver.toString() !== driverId.toString()) {
            return res.status(403).json({ success: false, message: "Not authorized for this ride." });
        }

        if (ride.status !== "approved") {
            return res.status(400).json({ success: false, message: `Ride status is '${ride.status}', must be 'approved' to start.` });
        }

        ride.status = "in progress";

        const allRidesApproved = booking.rides.every(r => r.status === "approved" || r.status === "in progress");
        const anyRideInProgress = booking.rides.some(r => r.status === "in progress");

        if (anyRideInProgress) {
            booking.status = "in progress";
        } else if (allRidesApproved) {
             booking.status = "approved";
        }

          await booking.save();

            io.to(booking.userId.toString()).emit('rideStarted', { 
                bookingId: booking._id.toString(),
                rideId: ride._id.toString()
            });
        return res.status(200).json({ 
            success: true, 
            message: "Ride started successfully.",
            booking 
        });

    } catch (err) {
        console.error("Error starting ride:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

const completeRide = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const driverId = req.user._id;

    const booking = await BookingModel.findById(bookingId);

    if (!booking || booking.driver.toString() !== driverId.toString()) {
      return res.status(404).json({ message: 'Booking not found or not assigned to this driver.' });
    }

    if (booking.status !== 'in progress') {
      return res.status(400).json({ message: 'Cannot complete a ride that is not in progress.' });
    }

    booking.status = 'completed';
    // You might also calculate and set the final fare here
    // booking.finalFare = ...
    await booking.save();

    // Notify the user via Socket.IO
    io.to(booking.user.toString()).emit('rideCompleted', { bookingId, fare: booking.amount });

    res.status(200).json({ message: 'Ride completed successfully.', booking });
  } catch (error) {
    console.error('Error completing ride:', error);
    res.status(500).json({ message: 'Server error.', error });
  }
};

// POST /api/driver/ride/cancel
// Allows a driver to cancel a ride if it hasn't been completed.
const cancelRide = async (req, res) => {
  try {
    const driver = req.driver;
    if (!driver) {
      return res.status(403).json({ success: false, message: "Access denied: Not a driver." });
    }
    const { rideId } = req.body;
    const ride = await RideModel.findById(rideId);
    if (!ride) {
      return res.status(404).json({ success: false, message: "Ride not found." });
    }
    if (ride.driver.toString() !== driver._id.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized to update this ride." });
    }
    // Prevent cancelling a ride that is already completed.
    if (ride.status === "completed") {
      return res.status(400).json({ success: false, message: "Completed rides cannot be cancelled." });
    }
    ride.status = "declined";
    await ride.save();
    return res.status(200).json({ success: true, message: "Ride cancelled successfully.", ride });
  } catch (error) {
    console.error("Error cancelling ride:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const getUpcomingRides = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.roles.includes("driver")) {
      return res.status(403).json({ success: false, message: "Access denied: Not a driver." });
    }
    const now = new Date();
    // Retrieve rides scheduled for the future; you might adjust statuses as needed
    const rides = await RideModel.find({
      driver: user._id,
      status: { $in: [ "scheduled"] },
      selectedDate: { $gte: now }
    });
    return res.status(200).json({ success: true, rides });
  } catch (error) {
    console.error("Error fetching upcoming rides:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};


const getDriverEarnings = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.roles.includes("driver")) {
      return res.status(403).json({ success: false, message: "Access denied: Not a driver." });
    }
    
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay()); // assuming Sunday start; adjust as needed
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Aggregate earnings from rides completed in each period
    const [todayResult, weekResult, monthResult] = await Promise.all([
      RideModel.aggregate([
        { $match: {
            driver: user._id,
            status: "completed",
            updatedAt: { $gte: startOfDay, $lt: new Date(startOfDay.getTime() + 24*60*60*1000) }
          }
        },
        { $group: { _id: null, total: { $sum: "$price" } } }
      ]),
      RideModel.aggregate([
        { $match: {
            driver: user._id,
            status: "completed",
            updatedAt: { $gte: startOfWeek, $lt: new Date(startOfWeek.getTime() + 7*24*60*60*1000) }
          }
        },
        { $group: { _id: null, total: { $sum: "$price" } } }
      ]),
      RideModel.aggregate([
        { $match: {
            driver: user._id,
            status: "completed",
            updatedAt: { $gte: startOfMonth, $lt: new Date(now.getFullYear(), now.getMonth()+1, 1) }
          }
        },
        { $group: { _id: null, total: { $sum: "$price" } } }
      ])
    ]);

    const todayEarnings = todayResult.length > 0 ? todayResult[0].total : 0;
    const weekEarnings = weekResult.length > 0 ? weekResult[0].total : 0;
    const monthEarnings = monthResult.length > 0 ? monthResult[0].total : 0;
    
    return res.status(200).json({
      success: true,
      earnings: {
        today: todayEarnings,
        week: weekEarnings,
        month: monthEarnings,
      },
    });
  } catch (error) {
    console.error("Error fetching driver earnings:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const getPerformanceMetrics = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.roles.includes("driver")) {
      return res.status(403).json({ success: false, message: "Access denied: Not a driver." });
    }

    const metrics = await RideModel.aggregate([
      {
        $match: {
          driver: user._id,
          status: "completed",
        },
      },
      {
        $group: {
          _id: null,
          totalCompleted: { $sum: 1 },
          totalFare: { $sum: "$price" },
          avgFare: { $avg: "$price" },
          avgDuration: { $avg: "$duration" }, // Assumes a "duration" field (in minutes) exists
        },
      },
    ]);

    let result = {
      totalCompleted: 0,
      averageFare: 0,
      averageDuration: null,
    };

    if (metrics.length > 0) {
      result.totalCompleted = metrics[0].totalCompleted;
      result.averageFare = metrics[0].avgFare;
      result.averageDuration = metrics[0].avgDuration; // May be null if duration isn't stored
    }

    return res.status(200).json({ success: true, metrics: result });
  } catch (error) {
    console.error("Error fetching performance metrics:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const getDriverHistory = async (req, res) => {
  try {
    const driver = req.driver;
    if (!driver) {
      return res.status(403).json({ success: false, message: "Access denied: Not a driver." });
    }
    // Retrieve rides that are either completed or cancelled
    const historyRides = await RideModel.find({
      driver: driver._id,
      status: { $in: ["completed", "Cancelled"] }
    }).sort({ selectedDate: -1 });
    
    return res.status(200).json({ success: true, rides: historyRides });
  } catch (error) {
    console.error("Error fetching ride history:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const getDriverEarningsReport = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.roles.includes("driver")) {
      return res.status(403).json({ success: false, message: "Access denied: Not a driver." });
    }
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Aggregate earnings per day for the last 30 days
    const report = await RideModel.aggregate([
      {
        $match: {
          driver: driver._id,
          status: "completed",
          updatedAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$updatedAt" } },
          totalEarnings: { $sum: "$price" },
          rideCount: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    return res.status(200).json({ success: true, report });
  } catch (error) {
    console.error("Error fetching earnings report:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// In DriverController.js (or SupportController.js)
const submitSupportRequest = async (req, res) => {
  try {
    const driver = req.driver;
    if (!driver) {
      return res.status(403).json({ success: false, message: "Access denied: Not a driver." });
    }
    
    const { subject, message } = req.body;
    if (!subject || !message) {
      return res.status(400).json({ success: false, message: "Subject and message are required." });
    }
    
    // In production, save this support request to a database or forward it via email.
    // For now, we just log it.
    console.log(`Support request from driver ${driver._id} (${driver.name}):`);
    console.log(`Subject: ${subject}`);
    console.log(`Message: ${message}`);
    
    return res.status(200).json({ success: true, message: "Support request submitted successfully." });
  } catch (error) {
    console.error("Error submitting support request:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

const updateRideFare = async (req, res) => {
  try {iver
    const driver = req.driver; 
    if (!driver) {
      return res.status(403).json({ success: false, message: "Access denied: Not a driver." });
    }
    const { rideId, newFare } = req.body;
    if (!rideId || newFare == null) {
      return res.status(400).json({ success: false, message: "Ride ID and new fare are required." });
    }
    
    // Find the ride
    const ride = await RideModel.findById(rideId);
    if (!ride) {
      return res.status(404).json({ success: false, message: "Ride not found." });
    }
    
    // Ensure the ride is assigned to this driver
    if (ride.driver.toString() !== driver._id.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized to update this ride." });
    }
    
    // Optionally, add a check to only allow fare updates when ride status is 'assigned' or 'scheduled'
    if (!["assigned", "scheduled"].includes(ride.status.toLowerCase())) {
      return res.status(400).json({ success: false, message: "Fare cannot be updated at this stage." });
    }
    
    // Update the fare
    ride.price = newFare;
    await ride.save();
    
    return res.status(200).json({ success: true, message: "Fare updated successfully", ride });
  } catch (error) {
    console.error("Error updating ride fare:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

const driverRespondToRide = async (req, res) => {
  try {
    const { rideId, response } = req.body;
    const driverProfile        = req.driverProfile;
    const user                 = req.user;

    if (!driverProfile || !user) {
      return res
        .status(401)
        .json({ success: false, message: "Driver authentication failed" });
    }

    // 1) Find the master ride (to get norm fields & date)
    const masterRide = await RideModel.findById(rideId).lean();
    if (!masterRide) {
      return res
        .status(404)
        .json({ success: false, message: "Ride not found" });
    }

    // 2) Find the booking & subdoc
    const booking = await BookingModel.findOne({ "rides._id": rideId });
    if (!booking) {
      return res
        .status(404)
        .json({ success: false, message: "Booking not found" });
    }
    const ride = booking.rides.id(rideId);
    if (!ride) {
      return res
        .status(404)
        .json({ success: false, message: "Ride not found in booking" });
    }

    // 3) Verify driver owns it
    if (ride.driver.toString() !== user._id.toString()) {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized for this ride" });
    }

    // 4) Only pending rides can be updated
    if (ride.status !== "pending approval") {
      return res.status(400).json({
        success: false,
        message: `Ride has already been ${ride.status}`,
      });
    }

      const approvedDocs = await BookingModel.aggregate([
        { $unwind: "$rides" },
        { $match: {
            "rides._id": rideId,
            "rides.status": "approved",
            "rides.driver": user._id.toString()
        }},
        { $group: {
            _id: null,
            totalSeats: { $sum: "$rides.passengers" }
        }}
      ]);
      const approvedSeats = approvedDocs[0]?.totalSeats || 0;



      // block over‑capacity using **ride.maxPassengers**
      if (
        response === "approved" &&
        approvedSeats + ride.passengers > ride.maxPassengers
      ) {
        return res.status(400).json({
          success: false,
          message: "Cannot approve — ride is full"
        });
      }

    // 7) Update status
    if (response === "approved") {
      ride.status = "approved";
    } else if (response === "declined") {
      ride.status = "declined";
    } else {
      return res
        .status(400)
        .json({ success: false, message: "Invalid response" });
    }

    // 8) Save booking & recalc its overall status
    await booking.save();
    const total     = booking.rides.length;
    const approved  = booking.rides.filter(r => r.status === "approved")
                                    .length;
    booking.status = approved === total
      ? "approved"
      : approved > 0
        ? "partially approved"
        : "pending approval";
    await booking.save();

  const bookingUser = await UserModel.findById(booking.userId);
  const title = response === "approved"
      ? "Ride Approved"
      : "Ride Declined";
  const body = response === "approved"
      ? `Hi ${bookingUser.name}, your ride from ${ride.pickup} to ${ride.destination} is approved.`
      : `Hi ${bookingUser.name}, your ride from ${ride.pickup} to ${ride.destination} was declined.`;

await notificationQueue.add('ride-response', {
    userId: booking.userId.toString(),
    title, 
    body,  
    data: { rideId: ride._id.toString(), bookingId: booking._id.toString(), type: response },
    topic: null,
    scheduledAt: new Date()
});
    // 9) Notify the booked user
    io.to(booking.userId.toString())
      .emit("rideResponseUpdate", { ride, booking, response });

      // later when broadcasting "rideFull":
      if (
        response === "approved" &&
        approvedSeats + ride.passengers === ride.maxPassengers
      ) {
        const dateKey = masterRide.selectedDate.toISOString().split("T")[0];
        const room = `search_${masterRide.pickupNorm}_${masterRide.destinationNorm}_${dateKey}`;
        io.to(room).emit("rideFull", { rideId });
      }

      if (bookingUser?.fcmToken) {
        await sendPushNotification(bookingUser.fcmToken, {
          title,             
          body,            
          data: {           
            rideId:    ride._id.toString(),
            bookingId: booking._id.toString(),
            type:      title,
            url:       "/myBookings",
            tag:       "ride-response",  
          }
        });
      }

    await Notification.create({
      userId: booking.userId,
      message: body,
      body: body,
      title: title,
      type: "ride-request",
      isRead: false,
    });

    // 12) Final response
    return res.status(200).json({
      success: true,
      message: `Ride ${response} successfully`,
      booking,
    });
  } catch (err) {
    console.error("Error in driverRespondToRide:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const arriveAtPickup = async (req, res) => {
  const { rideId } = req.body;
  // find booking & ride subdoc
  const booking = await BookingModel.findOne({ "rides._id": rideId });
  if (!booking) return res.status(404).json({ success: false, message: "Ride not found" });

  const ride = booking.rides.id(rideId);
  ride.status = "arrived";
  booking.status = "driver_en_route";
  await booking.save();

  // notify user and driver
  io.to(booking.userId.toString()).emit("rideArrived", { rideId });
  io.to(ride.driver.toString()).emit("arrivedConfirmed", { rideId });

  res.json({ success: true, message: "Driver has arrived at pickup" });
};


const getPendingRideRequests = async (req, res) => {
  try {
    const driverProfile = req.driverProfile;
    const user = req.user;

    if (!driverProfile || !user) {
      return res.status(401).json({ success: false, message: "Driver authentication failed" });
    }

    console.log("✅ Getting pending requests for driver:", user._id);

    // ✅ FIX: Look for bookings with rides assigned to this driver that need approval
    const bookings = await BookingModel.find({
      "rides.driver": user._id.toString(),
      "rides.status": "pending approval"
    })
    .populate('userId', 'name email phone')  // Populate user who made the booking
    .sort({ createdAt: -1 });

    // Extract only the rides that belong to this driver and need approval
    const pendingRides = bookings.flatMap(booking => {
      const driverRides = booking.rides.filter(ride => 
        ride.driver === user._id.toString() && 
        ride.status === "pending approval"
      );
      
      // Add booking context to each ride
      return driverRides.map(ride => ({
        ...ride.toObject(),
        bookingId: booking._id,
        bookedBy: booking.userId,
        bookingDate: booking.createdAt
      }));
    });

    console.log(`Found ${pendingRides.length} pending ride requests for driver ${user._id}`);

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
    const user = await UserModel.findById(decoded.id);
    if (!user || !user.roles.includes("driver")) {
      return res.status(401).json({ message: "Driver not found." });
    }
    // Find admin profile for completeness (optional)
    const driverProfile = await DriverProfile.findOne({ user: user._id });
    if (!driverProfile) {
      return res.status(401).json({ message: "Driver profile not found." });
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
    const newRefreshToken = signRefreshToken(user);
    const newHashed = await bcrypt.hash(newRefreshToken, 10);

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

      setAppCookie(res, "driverRefreshToken", newRefreshToken, {
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path:"/api/driver",
      });
      setAppCookie(res, "driverAccessToken", newAccessToken, {
        maxAge: 15 * 60 * 1000,
        path:"/api/driver",
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


const driverLogout = async (req, res) => {
  const refreshToken = req.cookies?.driverRefreshToken;

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
  loginDriver,
  forgotPassword,
  resetPassword,
  addRide,
  getCurrentRide,
  getCurrentRides, 
  getDriverBookings,
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
  driverRespondToRide,
  getPendingRideRequests,
  driverTokenRefresh,
  getDriverProfile,
  driverLogout,
  deleteDriverProfile,
}