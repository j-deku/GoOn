import bcrypt from "bcryptjs";
import UserModel from "../models/UserModel.js";
import AdminProfile from "../models/AdminProfile.js";
import AdminInvite from "../models/AdminInvite.js";

export const acceptInvite = async (req, res) => {
  const { token, name, password } = req.body;
  if (!token || !name || !password) return res.status(400).json({ message: "Missing fields" });

  const invite = await AdminInvite.findOne({ token, accepted: false });
  if (!invite || invite.expiresAt < new Date()) {
    return res.status(400).json({ message: "Invalid or expired invite" });
  }

  // Prevent duplicate accounts
  let user = await UserModel.findOne({ email: invite.email });
  if (user) return res.status(409).json({ message: "User already exists" });

  // *** Remove manual hash, let the pre-save do it ***
  user = await UserModel.create({
    name,
    email: invite.email,
    password, // <-- RAW password
    roles: invite.roles,
    verified: true,
  });
  await AdminProfile.create({ user: user._id });

  invite.accepted = true;
  await invite.save();

  res.json({ success: true, message: "Account created. Please login to set up 2FA." });
};