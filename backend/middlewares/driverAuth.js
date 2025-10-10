import jwt from "jsonwebtoken";
import UserModel from "../models/UserModel.js";
import DriverProfile from "../models/DriverProfile.js";
import dotenv from "dotenv";
dotenv.config();

const driverAuth = async (req, res, next) => {
  const token = req.cookies.driverAccessToken;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await UserModel.findById(decoded.id);
    if (!user || !user.roles.includes("driver")) {
      return res.status(401).json({ success: false, message: "Not authorized as a driver." });
    }
    // Find the driver's profile
    const driverProfile = await DriverProfile.findOne({ user: user._id });
    if (!driverProfile) {
      return res.status(401).json({ success: false, message: "Driver profile not found." });
    }
    if (driverProfile.status !== "active" || !driverProfile.approved) {
      return res.status(403).json({ success: false, message: "Driver account not active or not approved." });
    }
    req.user = user;
    req.driverProfile = driverProfile;
    req.body.driverId = driverProfile._id;
    req.body.userId = user._id;
    req.body.userRoles = user.roles;
    next();
  } catch (error) {
    if (["TokenExpiredError", "JsonWebTokenError", "NotBeforeError"].includes(error.name)) {
      return res.status(401).json({ success: false, message: "Token expired. Please log in again." });
    }
    console.error("Driver authentication error:", error);
    return res.status(500).json({ success: false, message: "Authentication error." });
  }
};

export default driverAuth;