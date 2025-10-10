// models/NotificationModel.js
import mongoose from 'mongoose';

const NotificationSchema = new mongoose.Schema(
  {
    jobId: { type: String, required: false, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: false, default:  null, index: true },
    rideId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ride', default: null },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },

    title: { type: String, required: true },
    body: { type: String, required: true },
    message: { type: String, default: 'Welcome back to TOLI-TOLI. Start booking your rides now!' }, // legacy fallback

    data: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
    extra: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },

    type: {
      type: String,
      enum: ['ride-response','global-update','login','register','promo',
        'system','ride-request', 'push-to-drivers', 'push-to-users', 
        'push-to-customers', 'push-promo', 'push-new-driver', 
        'push-new-user', 'push-to-admins',],
      default: 'system',
    },

    scheduledAt: { type: Date, default: Date.now },
    sentAt: { type: Date, default: null },
    status: { type: String, enum: ['pending','sent','failed','delayed','skipped'], default: 'pending' },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: '' },

    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);
