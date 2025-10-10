// models/AdminInvite.js
import mongoose from 'mongoose';

const adminInviteSchema = new mongoose.Schema({
  email:      { type: String, required: true, lowercase: true, trim: true },
  roles:      { type: [String], required: true, enum: ["admin","super-admin","admin-manager"] },
  token:      { type: String, required: true, unique: true },
  expiresAt:  { type: Date, required: true },
  accepted:   { type: Boolean, default: false },
  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

const AdminInvite = mongoose.models.AdminInvite || mongoose.model('AdminInvite', adminInviteSchema);
export default AdminInvite;
