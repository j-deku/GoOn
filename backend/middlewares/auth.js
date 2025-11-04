import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();
const prisma = new PrismaClient();

const authMiddleware = async (req, res, next) => {
  const token =
    req.cookies.userAccessToken ||
    req.cookies.access_token ||
    req.headers.authorization?.split(" ")[1];

  if (!token || token.trim() === "" || token === "null") {
    return res.status(401).json({
      success: false,
      message: "Not authorized. Please log in again.",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: {
        roleAssignments: {
          select: { role: true },
        },
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid session. User not found.",
      });
    }

    if (user.lockUntil && user.lockUntil > new Date()) {
      return res.status(423).json({
        success: false,
        message: "Account locked. Try again later.",
      });
    }

    // Flatten roles from roleAssignments
    const userRoles = user.roleAssignments.map(r => r.role);

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      verified: user.verified,
      roles: userRoles,
    };

    req.body.userId = user.id;
    req.body.userRoles = userRoles;

    next();
  } catch (error) {
    console.error("Auth error:", error);

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please log in again.",
      });
    }

    if (["JsonWebTokenError", "NotBeforeError"].includes(error.name)) {
      return res.status(403).json({
        success: false,
        message: "Invalid token. Please log in again.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error during authentication.",
    });
  }
};

export default authMiddleware;
