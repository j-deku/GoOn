import express from "express";
import upload from '../config/Multer.js';
import { 
  adminLogin, 
  forgotPassword, 
  getBookingStatusDistribution, 
  getDashboardStats, 
  getMonthlyBookings, 
  getMonthlyRevenue, 
  getCommissionRate,
  setCommissionRate,
  resetPassword,
  getAllRides,
  getRideById,
  assignRideToDriver,
  updateRideStatus,
  getAllDrivers,
  getAllBookings,
  addRide,
  listRide,
  removeRide,
  rideSearch,
  addDriver,
  updateRideDetails, // New endpoint
  updateDriverDetails, // New endpoint
  getDriverById,
  approveDriver,
  adminTokenRefresh,
  verify2FA,
  adminLogout,
  getAdminProfile,
  setup2FA,
  changePassword,
  updateAdminAvatar,
  publishGlobalUpdate,
  verifyRecaptchaHold,
} from "../controllers/AdminController.js";
import { verifyAdmin}  from "../middlewares/adminAuth.js";
import verifyPre2FAToken from "../middlewares/verifyPre2FA.js";
import { generateCsrfToken } from "../middlewares/csrf.js";
import verifyBackupCode from "../controllers/verifyBackupCodes.js";
import regenerateBackupCodes from "../controllers/generateBackupCodes.js";
import { cancelInvite, inviteAdmin, listPendingInvites } from "../controllers/AdminInvite.js";
import { acceptInvite } from "../controllers/AcceptInvite.js";
import { captchaRateLimiter } from "../middlewares/captchaRateLimit.js";
import { adminIPGuard, checkAdminIP } from "../middlewares/AdminIPGuard.js";
import { AdminLoginLimiter, limiter } from "../middlewares/rateLimiter.js";

const adminRouter = express.Router();
adminRouter.get("/check-ip", limiter, checkAdminIP);

adminRouter.use(adminIPGuard);

adminRouter.post("/login", AdminLoginLimiter, adminLogin);
adminRouter.post("/verify-captcha-hold", captchaRateLimiter, verifyRecaptchaHold);
adminRouter.post("/forgot-password", forgotPassword);
adminRouter.post("/reset-password/:token", resetPassword);
adminRouter.post("/accept-invite", acceptInvite);
adminRouter.post("/verify-2fa", limiter, verifyPre2FAToken, verify2FA);
adminRouter.get("/setup-2fa", limiter, verifyPre2FAToken, setup2FA);
adminRouter.post("/verify-backup-code", limiter, verifyPre2FAToken, verifyBackupCode);
adminRouter.post("/regenerate-backup-codes", regenerateBackupCodes);
adminRouter.post("/refresh-token", adminTokenRefresh);
adminRouter.get("/csrf-token", generateCsrfToken); 

adminRouter.get("/commission", getCommissionRate);

//verifyAdmin middleware
adminRouter.use(verifyAdmin);

adminRouter.get("/me", getAdminProfile);
adminRouter.post("/logout", adminLogout);
adminRouter.get("/stats", getDashboardStats);
adminRouter.post("/invite", inviteAdmin);
adminRouter.get("/pending-invites", listPendingInvites);
adminRouter.delete("/invite/:id", cancelInvite);
adminRouter.post("/profile/avatar", upload.single('avatar'), updateAdminAvatar);
adminRouter.post("/profile/password", changePassword)
adminRouter.get("/monthly-revenue", getMonthlyRevenue);
adminRouter.get("/booking-status", getBookingStatusDistribution);
adminRouter.get("/monthly-bookings", getMonthlyBookings);
adminRouter.post("/commission", setCommissionRate);

//push notifications only
adminRouter.post("/global-update", publishGlobalUpdate);
adminRouter.post("/push-to-drivers", );
adminRouter.post("/push-to-users", );
adminRouter.post("/push-to-customers",);
adminRouter.post("/push-promo", );
adminRouter.post("/push-new-driver",);
adminRouter.post("/push-new-user", );
adminRouter.post("/push-to-admins",);

// Ride management endpoints
adminRouter.get("/rides", getAllRides);
adminRouter.get("/rides/:id", getRideById);
adminRouter.post("/assign-ride", assignRideToDriver);
adminRouter.put("/rides/:id/status", updateRideStatus);
adminRouter.post("/add", upload.single("image"), addRide);
adminRouter.get("/list", listRide);
adminRouter.put("/rides/:id", upload.single("image"), updateRideDetails);
adminRouter.get("/search", rideSearch);
adminRouter.post("/remove", removeRide);

// Driver and Booking endpoints
adminRouter.get("/drivers", getAllDrivers);
adminRouter.put("/drivers/approve/:driverId", approveDriver);
adminRouter.post("/add-driver", upload.single("avatar"), addDriver);
adminRouter.get("/drivers/:id", getDriverById);
adminRouter.put("/drivers/:id", upload.single("avatar"), updateDriverDetails);

adminRouter.get("/bookings", getAllBookings);

export default adminRouter;