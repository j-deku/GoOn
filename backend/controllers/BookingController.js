import dotenv from "dotenv";
import Paystack from "paystack-api";
import prisma from "../config/Db.js";
import { io } from "../sever.js";
dotenv.config();

const paystack = new Paystack(process.env.PAYSTACK_SECRET_KEY);

// ==============================
// PLACE BOOKINGS
// ==============================
export const placeBookings = async (req, res) => {
  const frontend_url = process.env.FRONTEND_URL || "http://localhost:5173";
  const { userId, rides: requestedRides, amount, address, email, currency = "USD" } = req.body;

  if (!userId || !Array.isArray(requestedRides) || requestedRides.length === 0 || !amount || !address || !email) {
    return res.status(400).json({ success: false, message: "Missing required fields" });
  }

  try {
    // 1) Fetch all ride data
    const rideIds = requestedRides.map(r => Number(r.id || r._id));
    const masterRides = await prisma.ride.findMany({
      where: { id: { in: rideIds } },
    });

    // 2) Validate and build booking rides
    const bookingRides = requestedRides.map((r) => {
      const master = masterRides.find(m => m.id === Number(r.id || r._id));
      if (!master) throw new Error(`Ride ${r._id} not found`);
      if (r.passengers > master.maxPassengers)
        throw new Error(`Requested ${r.passengers} seats exceeds limit of ${master.maxPassengers} for ride ${r._id}`);

      return {
        id: master.id,
        pickup: master.pickup,
        destination: master.destination,
        price: master.price,
        currency: master.currency,
        description: master.description,
        selectedDate: master.selectedDate,
        selectedTime: master.selectedTime,
        passengers: r.passengers,
        imageUrl: master.imageUrl,
        type: master.type,
        status: "pending approval",
        driverId: master.driverId,
        pickupLocation: { lat: master.locationLat, lng: master.locationLng },
      };
    });

    // 3) Create booking record
    const newBooking = await prisma.booking.create({
      data: {
        userId: Number(userId),
        rides: bookingRides, // JSON column
        amount,
        currency,
        address,
        email,
      },
    });

    // 4) Clear user's cart items
    await prisma.cartItem.deleteMany({ where: { userId: Number(userId) } });

    // 5) Notify nearby drivers (simplified example — you can integrate location later)
    for (const ride of bookingRides) {
      if (ride.driverId) {
        const driverRoom = ride.driverId.toString();
        io.to(driverRoom).emit("rideRequest", {
          bookingId: newBooking.id,
          ride,
        });
      }
    }

    // 6) Initialize Paystack transaction
    const paymentData = {
      email,
      amount: amount * 100,
      callback_url: `${frontend_url}/verify?success=true&bookingId=${newBooking.id}`,
      cancel_url: `${frontend_url}/verify?success=false&bookingId=${newBooking.id}`,
    };

    const response = await paystack.transaction.initialize(paymentData);
    if (!response.status) {
      return res.status(500).json({ success: false, message: "Error initializing payment" });
    }

    res.json({
      success: true,
      authorization_url: response.data.authorization_url,
    });

  } catch (err) {
    console.error("placeBookings error:", err);
    const isCapacityErr = err.message.includes("exceeds limit");
    res.status(isCapacityErr ? 400 : 500).json({
      success: false,
      message: isCapacityErr ? err.message : "Error placing booking.",
    });
  }
};

// ==============================
// VERIFY BOOKINGS
// ==============================
export const verifyBookings = async (req, res) => {
  const { bookingId, success } = req.body;
  try {
    if (success === "true") {
      const booking = await prisma.booking.update({
        where: { id: Number(bookingId) },
        data: { payment: true },
      });

      const rides = booking.rides || [];
      for (const ride of rides) {
        if (!["approved", "declined"].includes(ride.status)) {
          await prisma.ride.update({
            where: { id: Number(ride.id) },
            data: { status: "PENDING_APPROVAL" },
          });
          if (ride.driverId) {
            io.to(ride.driverId.toString()).emit("rideRequest", { bookingId, ride });
          }
        }
      }

      res.status(200).json({ success: true, message: "Payment successful", booking });
    } else {
      await prisma.booking.delete({ where: { id: Number(bookingId) } });
      res.status(200).json({ success: false, message: "Payment failed" });
    }
  } catch (error) {
    console.error("verifyBookings error:", error);
    res.status(500).json({ success: false, message: "Error verifying payment" });
  }
};

// ==============================
// USER BOOKINGS
// ==============================
export const userBookings = async (req, res) => {
  try {
    const bookings = await prisma.booking.findMany({
      where: { userId: Number(req.body.userId) },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: bookings });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: "Error fetching bookings" });
  }
};

// ==============================
// ADMIN LIST BOOKINGS
// ==============================
export const listBookings = async (req, res) => {
  try {
    const bookings = await prisma.booking.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: bookings });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: "Error listing bookings" });
  }
};

// ==============================
// UPDATE BOOKING STATUS
// ==============================
export const updateStatus = async (req, res) => {
  try {
    await prisma.booking.update({
      where: { id: Number(req.body.bookingId) },
      data: { status: req.body.status },
    });
    res.json({ success: true, message: "Status Updated" });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: "Error updating status" });
  }
};

// ==============================
// CANCEL BOOKING
// ==============================
export const cancelBooking = async (req, res) => {
  const { bookingId } = req.params;
  const userId = req.user.id;

  try {
    const booking = await prisma.booking.findUnique({
      where: { id: Number(bookingId) },
    });

    if (!booking || booking.userId !== userId) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }

    const updatedRides = booking.rides.map((r) => ({
      ...r,
      status: ["pending approval", "approved"].includes(r.status)
        ? "cancelled"
        : r.status,
    }));

    await prisma.booking.update({
      where: { id: Number(bookingId) },
      data: {
        rides: updatedRides,
        status: "CANCELLED",
      },
    });

    updatedRides.forEach((r) => {
      if (r.driverId) io.to(r.driverId.toString()).emit("rideCancelled", { rideId: r.id });
    });
    io.to(userId.toString()).emit("bookingCancelled", { bookingId });

    res.json({ success: true, message: "Booking and rides cancelled" });
  } catch (error) {
    console.error("cancelBooking error:", error);
    res.status(500).json({ success: false, message: "Error cancelling booking" });
  }
};
