// controllers/BookingController.js
import dotenv         from "dotenv";
import Paystack       from "paystack-api";
import BookingModel   from "../models/BookingModel.js";
import RideModel      from "../models/RideModel.js";
import DriverProfile  from "../models/DriverProfile.js";
import UserModel      from "../models/UserModel.js";
import { io } from "../sever.js";

dotenv.config();
const paystack = new Paystack(process.env.PAYSTACK_SECRET_KEY);

const placeBookings = async (req, res) => {
  const frontend_url = process.env.FRONTEND_URL || "http://localhost:5173";
  const { userId, rides: requestedRides, amount, address, email, currency="USD" } = req.body;

  // 1) Basic payload validation
  if (!userId || !Array.isArray(requestedRides) || requestedRides.length === 0
      || !amount || !address || !email) {
    return res.status(400).json({ success: false, message: "Missing required fields" });
  }
console.log("Incoming req.body.rides:", req.body.rides);
console.log("RequestedRides array:");
requestedRides.forEach((r, i) => {
  console.log(` rides[${i}] =`, r);
});

for (let i = 0; i < requestedRides.length; i++) {
  if (typeof requestedRides[i].passengers !== "number") {
    return res.status(400).json({
      success: false,
      message: `Missing 'passengers' for rides[${i}]`
    });
  }
}

  try {
    // 2) Build a trusted array of booking subdocs
    const bookingRides = await Promise.all(requestedRides.map(async (r) => {
      const master = await RideModel.findById(r._id).lean();
      if (!master) {
        throw new Error(`Ride ${r._id} not found`);
      }
      if (r.passengers > master.maxPassengers) {
        throw new Error(
          `Requested ${r.passengers} seats exceeds limit of ${master.maxPassengers} for ride ${r._id}`
        );
      }

      return {
        _id:                 master._id.toString(),
        pickup:              master.pickup,
        destination:         master.destination,
        price:               master.price,
        currency:            master.currency,
        description:         master.description,
        selectedDate:        master.selectedDate,
        selectedTime:        master.selectedTime,
        passengers:          r.passengers,                // user’s seats
        imageUrl:            master.imageUrl,
        type:                master.type,
        status:              "pending approval",
        driver:              master.driver.toString(),
        // include locations so you can find nearby drivers
        pickupLocation:      master.pickupLocation,
        destinationLocation: master.destinationLocation,
      };
    }));

    // 3) Create booking document
    const newBooking = await BookingModel.create({
      userId,
      rides:    bookingRides,
      amount,
      currency,
      address,
      email,
    });

    // 4) Clear cart
    await UserModel.findByIdAndUpdate(userId, { cartData: {} });

    // 5) Notify nearby drivers
    for (const ride of newBooking.rides) {
      const coords = ride.pickupLocation?.coordinates;
      if (!coords) continue;
      const [lng, lat] = coords;

      const nearbyDrivers = await DriverProfile.find({
        isAvailable: true,
        location: {
          $nearSphere: {
            $geometry:   { type: "Point", coordinates: [lng, lat] },
            $maxDistance: 10000,
          },
        },
      })
      .limit(5)
      .select("_id"); // we only need profile _id for room

      nearbyDrivers.forEach((driver) => {
        const roomId = driver._id.toString();
        io.to(roomId).emit("rideRequest", {
          bookingId: newBooking._id.toString(),
          ride,
        });
      });
    }

    const line_items = bookingRides.map((ride) => ({
      price_data: {
        currency: ride.currency.toLowerCase(),
        product_data: { name: ride.type },
        unit_amount: ride.price * 100,
      },
      quantity: ride.passengers,
    }));
    // service fee
    line_items.push({
      price_data: {
        currency: "usd",
        product_data: { name: "Service fee" },
        unit_amount: 200,
      },
      quantity: 1,
    });

    // 7) Initialize Paystack transaction
    const paymentData = {
      line_items,
      email,
      mode: "payment",
      amount: amount * 100,
      callback_url: `${frontend_url}/verify?success=true&bookingId=${newBooking._id}`,
      cancel_url:  `${frontend_url}/verify?success=false&bookingId=${newBooking._id}`,
    };
    const response = await paystack.transaction.initialize(paymentData);
    if (!response.status) {
      return res.status(500).json({ success: false, message: "Error initializing payment" });
    }

    // 8) Return authorization URL
    return res.json({
      success: true,
      authorization_url: response.data.authorization_url,
    });

  } catch (err) {
    console.error("placeBookings error:", err);
    // If we threw our capacity error, return 400 with that message
    const isCapacityErr = err.message.includes("exceeds limit");
    return res.status(isCapacityErr ? 400 : 500).json({
      success: false,
      message: isCapacityErr ? err.message : "There's an issue when placing your booking. Kindly try again later or check the availability of the rides.",
    });
  }
};

const verifyBookings = async (req, res) => {
  const { bookingId, success } = req.body;
  try {
    if (success === "true") {
      const booking = await BookingModel.findByIdAndUpdate(
        bookingId,
        { payment: true },
        { new: true }
      ).populate("rides");

      for (const ride of booking.rides) {
        if (!["approved","declined"].includes(ride.status)) {
          await RideModel.findByIdAndUpdate(ride._id, { status: "pending approval" });
          
          if (ride.driver) {
            // 1) Look up the DriverProfile by the user reference:
            const profile = await DriverProfile.findOne({ user: ride.driver });
            if (profile) {
              const roomId = profile._id.toString();
              io.to(roomId).emit("rideRequest", {
                bookingId,
                ride: {
                  ...ride.toObject(),
                  // you can serialize or trim fields here
                }
              });
              console.log(`🚀 Emitted rideRequest to driver room: ${roomId}`);
            } else {
              console.warn("No profile found for driver user:", ride.driver);
            }
          }
        }
      }

      return res.status(200).json({
        success: true,
        message: "Payment successful and ride(s) assigned",
        booking
      });
    } else {
      // payment failed
      await BookingModel.findByIdAndDelete(bookingId);
      return res.status(200).json({ success: false, message: "Payment failed" });
    }
  } catch (error) {
    console.error("Error verifying payment:", error);
    return res.status(500).json({ success: false, message: "Error verifying payment" });
  }
};

//user bookings for frontend
const userBookings = async(req,res) =>{
try {
    const bookings = await BookingModel.find({userId:req.body.userId});
    res.json({success:true,data:bookings})
} catch (error) {
    console.log(error);
    res.json({success:false,message:"Error"});
}
}

//Listing bookings for admin panel
const listBookings = async(req,res) =>{
    try {
        const bookings = await BookingModel.find({});
        res.json({success:true,data:bookings});
    } catch (error) {
        console.log(error);
        res.json({success:false,message:"Error"});
    }
}

//api for updating bookings status
const updateStatus = async (req,res) =>{
    try {
        await BookingModel.findByIdAndUpdate(req.body.bookingId,{status:req.body.status});
        res.json({success:true,message:"Status Updated"});
    } catch (error) {
        console.log(error);
        res.json({success:false,message:"Error"});
    }
}

// controllers/BookingController.js
const cancelBooking = async (req, res) => {
  const { bookingId } = req.params;
  const userId = req.user._id;

  const booking = await BookingModel.findById(bookingId);
  if (!booking || booking.userId.toString() !== userId.toString()) {
    return res.status(403).json({ success: false, message: "Not authorized" });
  }

  // Only allow cancelling pending or approved rides
  booking.rides.forEach((ride) => {
    if (["pending approval","approved"].includes(ride.status)) {
      ride.status = "cancelled";
    }
  });
  booking.status = "cancelled";
  await booking.save();

  // Notify drivers and user
  booking.rides.forEach(ride => {
    io.to(ride.driver.toString()).emit("rideCancelled", { rideId: ride._id });
  });
  io.to(userId.toString()).emit("bookingCancelled", { bookingId });

  res.json({ success: true, message: "Booking and its rides have been cancelled" });
};

export {placeBookings,verifyBookings,userBookings,listBookings,updateStatus, cancelBooking};
