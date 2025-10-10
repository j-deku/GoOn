// models/RatingModel.js
import mongoose from "mongoose";

const RatingSchema = new mongoose.Schema({
  ride:    { type: mongoose.Schema.Types.ObjectId, ref: "Ride", required: true },
  rater:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  ratee:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  score:   { type: Number, min: 1, max: 5, required: true },
  comment: { type: String },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Rating || mongoose.model("Rating", RatingSchema);
