import bcrypt from "bcryptjs";
import prisma from "../config/Db.js";
import logger from "../middlewares/logger.js";
import { logActivity } from "../utils/logActivity.js";

export const acceptInvite = async (req, res) => {
  const { token, name, password } = req.body;

  if (!token || !name || !password) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    // ✅ 1. Validate invite
    const invite = await prisma.adminInvite.findFirst({
      where: {
        token,
        accepted: false,
      },
    });

    if (!invite || invite.expiresAt < new Date()) {
      return res.status(400).json({ message: "Invalid or expired invite" });
    }

    // ✅ 2. Ensure no duplicate user
    const existingUser = await prisma.user.findUnique({
      where: { email: invite.email },
    });

    if (existingUser) {
      return res.status(409).json({ message: "User already exists" });
    }

    // ✅ 3. Hash password securely
    const hashedPassword = await bcrypt.hash(password, 12);

    // ✅ 4. Create user and profile atomically
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name,
          email: invite.email,
          password: hashedPassword,
          verified: true,
          roleAssignments: {
            create: JSON.parse(invite.roles).map((role) => ({
              role: role.toUpperCase(), // ✅ Prisma enum compliance
            })),
          },
        },
      });

      await tx.adminProfile.create({ data: { userId: newUser.id } });

      await tx.adminInvite.update({
        where: { id: invite.id },
        data: { accepted: true },
      });

      return newUser;
    });

    // ✅ 5. Log success
    const log = await logActivity({
      userId: user.id,
      role: JSON.parse(invite.roles).map((r) => r.toUpperCase()).join(", "),
      action: "Accept Invite",
      description: `New admin account created for ${invite.email}`,
      req,
    });

    const io = req.app.get("io");
    if (io && log) io.emit("new_activity_log", log);

    // ✅ 6. Respond to client
    return res.json({
      success: true,
      message: "Account created successfully. Please log in to set up 2FA.",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (err) {
    logger.error("AcceptInvite error:", err);

    const log = await logActivity({
      userId: null,
      role: "SYSTEM",
      action: "Accept Invite Failed",
      description: `Failed invite acceptance for token: ${token}. Error: ${err.message}`,
      req,
    });

    const io = req.app.get("io");
    if (io && log) io.emit("new_activity_log", log);

    return res.status(500).json({
      success: false,
      message: err.message || "Server error while accepting invite",
    });
  }
};
