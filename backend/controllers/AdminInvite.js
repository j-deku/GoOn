import crypto from "crypto";
import dotenv from "dotenv";
import { AdminInviteEmail } from "../utils/EmailTemplates.js";
import { sendEmail } from "../utils/sendEmail.js";
import prisma from "../config/Db.js";
import logger from "../middlewares/logger.js";
import { logActivity } from "../utils/logActivity.js";

dotenv.config();

// ================================
// 📩 Invite Admin
// ================================

export const inviteAdmin = async (req, res) => {
  const { email, roles, name } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email required" });
  }

  try {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // ✅ Remove any previous unaccepted invites for this email
    await prisma.adminInvite.deleteMany({
      where: {
        email: email.toLowerCase(),
        accepted: false,
      },
    });

    // ✅ Ensure roles are uppercase for Prisma ENUM compatibility
    const normalizedRoles = (
      Array.isArray(roles) && roles.length > 0 ? roles : ["ADMIN"]
    ).map((r) => r.toUpperCase());

    // ✅ Create the new invite
    await prisma.adminInvite.create({
      data: {
        email: email.toLowerCase(),
        roles: JSON.stringify(normalizedRoles),
        token,
        expiresAt,
        createdById: req.user.id,
      },
    });

    // ✅ Build the invitation link
    const inviteLink = `${process.env.FRONTEND_URL}/Oauth2/v1/admin/accept-invite?token=${token}`;
    const formattedExpiry = expiresAt.toLocaleString("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    // ✅ Send invitation email
    await sendEmail(
      email,
      "GoOn Admin Invitation",
      AdminInviteEmail({
        name,
        inviteLink,
        expiresAt: formattedExpiry,
      })
    );

    // ✅ Log and emit activity
    const log = await logActivity({
      userId: req.user.id,
      role: req.user.roleAssignments.map((r) => r.role).join(", "),
      action: "Invite Admin",
      description: `Invited admin with email: ${email}`,
      req,
    });

    const io = req.app.get("io");
    if (io && log) io.emit("new_activity_log", log);

    return res.json({
      success: true,
      message: "Invite sent successfully",
    });
  } catch (err) {
    logger.error("InviteAdmin error:", err);

    const log = await logActivity({
      userId: req.user.id,
      role: req.user.roleAssignments.map((r) => r.role).join(", "),
      action: "🟥Invite Admin Failed",
      description: `Failed to invite admin with email: ${email}. Error: ${err.message}`,
      req,
    });

    const io = req.app.get("io");
    if (io && log) io.emit("new_activity_log", log);

    return res.status(500).json({
      success: false,
      message: err.message || "Failed to send invite",
    });
  }
};
// ================================
// 📋 List Pending Invites (Only Yours)
// ================================
export const listPendingInvites = async (req, res) => {
  try {
    const invites = await prisma.adminInvite.findMany({
      where: {
        accepted: false,
        createdById: req.user.id,
      },
      select: {
        id: true,
        email: true,
        roles: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const formattedInvites = invites.map((invite) => ({
      ...invite,
      roles: JSON.parse(invite.roles),
    }));

          const log = await logActivity({
          userId: req.user.id,
          role: req.user.roleAssignments.map((r) => r.role).join(", "),
          action: "📋List Pending Invites",
          description: `Fetched pending invites`,
          req,
        });
          const io = req.app.get("io");
        if (io && log) {
          io.emit("new_activity_log", log);
        }
    return res.json({
      success: true,
      invites: formattedInvites,
    });
  } catch (err) {
    logger.error("ListPendingInvites error:", err);
          const log = await logActivity({
          userId: req.user.id,
          role: req.user.roleAssignments.map((r) => r.role).join(", "),
          action: "📋List Pending Invites Failed",
          description: `Failed to fetch pending invites. Error: ${err.message}`,
          req,
        });
          const io = req.app.get("io");
        if (io && log) {
          io.emit("new_activity_log", log);
        }
    return res.status(500).json({
      success: false,
      message: "Unable to fetch invites",
    });
  }
};

// ================================
// ❌ Cancel Invite (Only Yours)
// ================================
export const cancelInvite = async (req, res) => {
  const { id } = req.params;

  try {
    const invite = await prisma.adminInvite.findFirst({
      where: {
        id: parseInt(id),
        accepted: false,
        createdById: req.user.id,
      },
    });

    if (!invite) {
      return res.status(404).json({
        success: false,
        message: "Invite not found or not authorized",
      });
    }

    await prisma.adminInvite.delete({
      where: { id: invite.id },
    });

          const log = await logActivity({
          userId: req.user.id,
          role: req.user.roleAssignments.map((r) => r.role).join(", "),
          action: "Cancel Invite",
          description: `Cancelled invite for email: ${invite.email}`,
          req,
        });
          const io = req.app.get("io");
        if (io && log) {
          io.emit("new_activity_log", log);
        }

    return res.json({ success: true, message: "Invite cancelled" });
  } catch (err) {
    logger.error("CancelInvite error:", err);
          const log = await logActivity({
          userId: req.user.id,
          role: req.user.roleAssignments.map((r) => r.role).join(", "),
          action: "🟥Cancel Invite Failed",
          description: `Failed to cancel invite for id: ${id} Error: ${err.message}`,
          req,
        });
          const io = req.app.get("io");
        if (io && log) {
          io.emit("new_activity_log", log);
        }
    return res.status(500).json({
      success: false,
      message: "Failed to cancel invite",
    });
  }
};
