import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const refreshTokenSchema = new mongoose.Schema({
  token:       { type: String, required: true },
  createdAt:   { type: Date, default: Date.now },
  revoked:     { type: Boolean, default: false },
  expiresAt:   { type: Date, required: true },
}, { _id: false });

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String },
  avatar: { type: String },
  googleId: { type: String, unique: true, sparse: true },
  verified: { type: Boolean, default: false },
  roles: { 
    type: [String], 
    enum: ["user", "driver", "admin", "super-admin", "admin-manager"], 
    default: ["user"],
    required: true
  },
  refreshTokens: [refreshTokenSchema],
  resetToken: { type: String },
  resetTokenExpires: { type: Date },
  fcmToken: { type: String, default: null, sparse: true },
  failedLoginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date, default: null }
}, { timestamps: true });

userSchema.index(
  { fcmToken: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: {
      fcmToken: { $type: "string", $ne: null, $ne: "" },
    },
  }
);

// Always store email lowercase
userSchema.pre("save", function (next) {
  if (this.isModified("email")) {
    this.email = this.email.toLowerCase();
  }
  next();
});

// Hash password if changed
userSchema.pre("save", async function (next) {
  if (this.isModified("password") && this.password) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

// Clean up expired tokens
userSchema.pre("save", function (next) {
  if (this.refreshTokens && Array.isArray(this.refreshTokens)) {
    const now = new Date();
    this.refreshTokens = this.refreshTokens.filter(rt => !rt.expiresAt || rt.expiresAt > now);
  }
  next();
});

// Password comparison
userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.virtual('profileUrl').get(function() {
  return `/users/${this._id}`;
});

const UserModel = mongoose.models.User || mongoose.model("User", userSchema);
export default UserModel; 