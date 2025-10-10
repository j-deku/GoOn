import jwt from "jsonwebtoken";
import UserModel from "../models/UserModel.js";
import dotenv from "dotenv";
dotenv.config();

const authMiddleware = async (req, res, next) => {
  const token = req.cookies.userAccessToken;

  if (!token || token.trim() === "" || token === "null") {
    return res.status(401).json({ success: false, message: "Not authorized. Please log in again." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await UserModel.findById(decoded.id).select("-password");
    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid session. User not found." });
    }

    if (user.lockUntil && user.lockUntil > Date.now()) {
      return res.status(423).json({ success: false, message: "Account locked. Try again later." });
    }

    req.user = user;
    req.body.userId = user._id;
    req.body.userRoles = user.roles;

    next();

  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ success: false, message: "Session expired. Please log in again." });
    }

    if (["JsonWebTokenError", "NotBeforeError"].includes(error.name)) {
      return res.status(403).json({ success: false, message: "Invalid token. Please log in again." });
    }
    return res.status(500).json({ success: false, message: "Internal server error during authentication." });
  }
};

export default authMiddleware;
