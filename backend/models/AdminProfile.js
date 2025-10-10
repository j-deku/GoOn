import mongoose from "mongoose";

const adminProfileSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
  twoFASecret: { type: String, default: null },
  is2FAVerified: { type: Boolean, default: false },
  isDisabled: { type: Boolean, default: false },
  backupCodes: [{
    code: { type: String, required: true },   // hashed
    used: { type: Boolean, default: false }
  }],
  backupCodesGeneratedAt: { type: Date },
  failedLoginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date, default: null },
}, { timestamps: true });

const AdminProfile = mongoose.models.AdminProfile || mongoose.model("AdminProfile", adminProfileSchema);
export default AdminProfile; 