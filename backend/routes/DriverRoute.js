import express from "express";
import { cancelRide, completeRide, driverRespondToRide, getCurrentRide, getCurrentRides,driverTokenRefresh, getDriverEarnings, getDriverEarningsReport, getDriverHistory, getPendingRideRequests, getPerformanceMetrics, getUpcomingRides, loginDriver, registerDriver, addRide, startRide, submitSupportRequest, updateDriverProfile, updateRideFare, updateRideStatusDriver, getDriverRides, forgotPassword, resetPassword, updateRide, getRideById, deleteRide, driverLogout, getDriverProfile, arriveAtPickup, getDriverBookings } from "../controllers/DriverController.js";
import driverAuth from "../middlewares/driverAuth.js";
import upload from '../config/Multer.js'
import { rateRide } from "../controllers/RideController.js";

const driverRouter = express.Router();

driverRouter.post('/register', upload.single("avatar"), registerDriver);
driverRouter.post('/login', loginDriver);
driverRouter.post("/forgot-password", forgotPassword);
driverRouter.post("/reset-password/:token", resetPassword);
driverRouter.post("/refresh-token", driverTokenRefresh);

driverRouter.use(driverAuth); 

driverRouter.get("/me", getDriverProfile);
driverRouter.post("/profile", upload.single("avatar"), updateDriverProfile);
driverRouter.post("/logout", driverLogout);
driverRouter.post("/add",  upload.single("image"), addRide);
driverRouter.get("/rides", getDriverRides);
driverRouter.get("/rides/:id", getRideById);
driverRouter.delete("/rides/:id", deleteRide);
driverRouter.put("/rides/:id", upload.single("image"), updateRide);
driverRouter.post("/ride/status", updateRideStatusDriver);
driverRouter.get("/current-ride", getCurrentRide);
driverRouter.get("/current-rides", getCurrentRides);
driverRouter.get("/upcoming-rides", getUpcomingRides);
driverRouter.post("/arrive", arriveAtPickup);
driverRouter.get("/driver-bookings", getDriverBookings);
driverRouter.post("/startRide/:rideId", startRide);
driverRouter.post("/completeRide/:bookingId", completeRide);
driverRouter.post("/ride/cancel", cancelRide);

driverRouter.get("/earnings", getDriverEarnings);
driverRouter.get("/performance-metrics", getPerformanceMetrics);
driverRouter.post("/rate", rateRide);
driverRouter.get("/history", getDriverHistory);
driverRouter.get("/earnings-report", getDriverEarningsReport);
driverRouter.post("/support", submitSupportRequest);

driverRouter.put("/ride/fare", updateRideFare);
driverRouter.get("/pending-ride-requests", getPendingRideRequests);
driverRouter.post("/ride/respond", driverRespondToRide);
 
export default driverRouter;