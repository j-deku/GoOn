import crypto from "crypto";
import AdminInvite from "../models/AdminInvite.js";
import { AdminInviteEmail } from "../utils/EmailTemplates.js";
import {sendEmail} from "../utils/sendEmail.js";
import dotenv from "dotenv";
dotenv.config();
// POST /api/admin/invite
export const inviteAdmin = async (req, res) => {
  const { email, roles, name } = req.body;
  if (!email) return res.status(400).json({ message: "Email required" });

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  // Remove any previous unaccepted invites for this email
  await AdminInvite.deleteMany({ email: email.toLowerCase(), accepted: false });

  await AdminInvite.create({
    email: email.toLowerCase(),
    roles: roles && Array.isArray(roles) ? roles : ["admin"],
    token,
    expiresAt,
    createdBy: req.user._id,
  });

  const inviteLink = `${process.env.FRONTEND_URL}/admin/accept-invite?token=${token}`;
  const formattedExpiry = expiresAt.toLocaleString("en-US", { timeZone: "UTC", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });

  // Compose and send the invite email
  await sendEmail(
    email,
    "TOLI-TOLI Admin Invitation",
    AdminInviteEmail({
      name,
      inviteLink,
      expiresAt: formattedExpiry
    })
  );

  res.json({ success: true, message: "Invite sent" });
};

// List only the invites *you* created
export const listPendingInvites = async (req, res) => {
  try {
    const invites = await AdminInvite.find({
      accepted: false,
      createdBy: req.user._id
    })
      .select('email roles expiresAt')
      .sort({ createdAt: -1 });

    res.json({ success: true, invites });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Unable to fetch invites' });
  }
};

// Cancel only if *you* created it
export const cancelInvite = async (req, res) => {
  try {
    const { id } = req.params;
    const invite = await AdminInvite.findOneAndDelete({
      _id: id,
      accepted: false,
      createdBy: req.user._id
    });

    if (!invite) {
      // either wrong ID, already accepted, or not yours
      return res
        .status(404)
        .json({ success: false, message: 'Invite not found or you are not authorized' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to cancel invite' });
  }
};