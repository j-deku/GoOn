import express from 'express'
import authMiddleware from '../middlewares/auth.js'
import { cancelBooking, listBookings, placeBookings, updateStatus, userBookings, verifyBookings } from '../controllers/BookingController.js'

const bookRouter  = express.Router();
bookRouter.use(authMiddleware);

bookRouter.post("/place", placeBookings);
bookRouter.post("/verify", verifyBookings);
bookRouter.post("/userBookings", userBookings);
bookRouter.get("/list", listBookings);
bookRouter.post("/status", updateStatus);
bookRouter.post("/:bookingId/cancel", cancelBooking);

export default bookRouter;