import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import prisma from "../config/Db.js";
dotenv.config();


const driverAuth = async (req, res, next) => {
  const token = req.cookies.driverAccessToken;

  if (!token) {
    return res.status(401).json({ success: false, message: "Access token missing." });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Find user by ID
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: {
        roleAssignments: true,
        driverProfile: true,
      },
    });

    if (!user) {
      return res.status(401).json({ success: false, message: "User not found." });
    }

    // Check if user has driver role
    const hasDriverRole = user.roleAssignments.some(r => r.role === "DRIVER");
    if (!hasDriverRole) {
      return res.status(401).json({ success: false, message: "Not authorized as a driver." });
    }

    // Check driver profile
    const driverProfile = user.driverProfile;
    if (!driverProfile) {
      return res.status(401).json({ success: false, message: "Driver profile not found." });
    }

    if (driverProfile.status !== "active" || !driverProfile.approved) {
      return res.status(403).json({ success: false, message: "Driver account not active or not approved." });
    }

    // Attach user info to request
    req.user = user;
    req.driverProfile = driverProfile;
    req.body.driverId = driverProfile.id;
    req.body.userId = user.id;
    req.body.userRoles = user.roleAssignments.map(r => r.role);

    next();
  } catch (error) {
    if (["TokenExpiredError", "JsonWebTokenError", "NotBeforeError"].includes(error.name)) {
      return res.status(401).json({ success: false, message: "Token expired or invalid. Please log in again." });
    }

    console.error("Driver authentication error:", error);
    return res.status(500).json({ success: false, message: "Authentication error." });
  }
};

export default driverAuth;
