import mongoose from "mongoose";

const driverProfileSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
  phone: { type: String, required: true, trim: true },
  licenseNumber: { type: String, required: true, trim: true },
  vehicle: {
    vehicleType: { type: String, enum: ["Car", "Van", "Bus", "Motorbike", "Truck"], required: true },
    model: { type: String, required: true, trim: true },
    registrationNumber: { type: String, required: true, trim: true },
    capacity: { type: Number, required: true, min: 1 },
  },
  rating: { type: Number, default: 0, min: 0 },
  totalRides: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ["pending", "active", "inactive"], default: "pending" },
  approved: { type: Boolean, default: false },
  maxPassengers: { 
    type: Number, 
    required: true, 
    default: 4,       // default capacity
    min: 1 
  },
  isAvailable: {type: Boolean, default: true},
  documents: [{ type: String }],
  location: {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], index: "2dsphere", default: undefined },
  },
}, { timestamps: true });

const DriverProfile = mongoose.models.DriverProfile || mongoose.model("DriverProfile", driverProfileSchema);
export default DriverProfile; 