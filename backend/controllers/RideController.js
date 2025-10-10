import BookingModel from "../models/BookingModel.js";
import RatingModel from "../models/RatingModel.js";
import RideModel from "../models/RideModel.js";

// Helper to strip accents & lowercase
const stripAccents = (s = "") =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export const searchRides = async (req, res) => {
  try {
    const {
      pickup,
      destination,
      selectedDate,
      passengers,
      sort,
      filter,
      page = 1,
      limit = 10,
      pickupLat,
      pickupLng,
      destLat,
      destLng,
    } = req.query;

    const query = {};

    // Geospatial fallback if coords provided
    if (pickupLat && pickupLng) {
      query.pickupLocation = {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [parseFloat(pickupLng), parseFloat(pickupLat)],
          },
          $maxDistance: 10000, // 10 km
        },
      };
    } else if (pickup) {
      // Accent-insensitive match on normalized field
      query.pickupNorm = {
        $regex: stripAccents(pickup),
        $options: "i",
      };
    }

    if (destLat && destLng) {
      query.destinationLocation = {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [parseFloat(destLng), parseFloat(destLat)],
          },
          $maxDistance: 10000,
        },
      };
    } else if (destination) {
      query.destinationNorm = {
        $regex: stripAccents(destination),
        $options: "i",
      };
    }

    // Date filtering
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const currentTime = now.toTimeString().slice(0, 5); // "HH:mm"

    if (selectedDate) {
      // filter to exact day
      const d = new Date(selectedDate);
      const start = new Date(d.setHours(0, 0, 0, 0));
      const end = new Date(d.setHours(23, 59, 59, 999));
      query.selectedDate = { $gte: start, $lte: end };

      // if user is searching for today, only future times
      const todayString = startOfToday.toISOString().split("T")[0];
      const selString = start.toISOString().split("T")[0];
      if (selString === todayString) {
        query.selectedTime = { $gte: currentTime };
      }
    } else {
      // no date filter: only future rides (today + future days)
      query.$or = [
        { selectedDate: { $gt: endOfToday } },
        { selectedDate: { $gte: startOfToday, $lte: endOfToday }, selectedTime: { $gte: currentTime } },
      ];
    }

    // Minimum passengers
    if (passengers) {
      query.passengers = { $gte: Number(passengers) };
    }

    // Type filter
    if (filter && filter.toLowerCase() !== "all") {
      query.type = { $regex: `^${filter}$`, $options: "i" };
    }

    // Sorting
    const sortCriteria = {};
    if (sort === "earliest") sortCriteria.selectedDate = 1;
    else if (sort === "lowestPrice") sortCriteria.price = 1;
    else if (sort === "shortestRide") sortCriteria.distance = 1;

    // 2) Fetch matching rides
    const [ rides, totalCount ] = await Promise.all([
      RideModel.find(query)
        .populate("driver", "name imageUrl")
        .sort(sortCriteria)
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .lean(),
      RideModel.countDocuments(query),
    ]);
    const totalPages = Math.ceil(totalCount / Number(limit));

    // 3) Aggregate approved seats per ride
    const agg = await BookingModel.aggregate([
      { $unwind: "$rides" },
      { $match: { "rides.status": "approved" } },
      { $group: {
          _id: "$rides._id",
          seatsTaken: { $sum: "$rides.passengers" }
      }}
    ]);
    const seatsMap = agg.reduce((m, a) => (m[a._id] = a.seatsTaken, m), {});

      // controllers/search.js
      const enriched = rides.map(r => {
        const seatsTaken = seatsMap[r._id] || 0;
        // now compare seatsTaken >= r.maxPassengers
        const isFull = seatsTaken >= r.maxPassengers;
        return { ...r, seatsTaken, isFull };
      });

    return res.status(200).json({ success: true, rides:enriched, totalPages });
  } catch (error) {
    console.error("Error in searchRides:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

export const getRideCounts = async (req, res) => {
  try {
    const { pickup, destination, selectedDate, passengers } = req.query;
    const match = {};

    if (pickup)
      match.pickupNorm = { $regex: stripAccents(pickup), $options: "i" };
    if (destination)
      match.destinationNorm = { $regex: stripAccents(destination), $options: "i" };
    if (selectedDate) {
      const d = new Date(selectedDate);
      match.selectedDate = {
        $gte: new Date(d.setHours(0, 0, 0, 0)),
        $lte: new Date(d.setHours(23, 59, 59, 999)),
      };
    }
    if (passengers) match.passengers = { $gte: Number(passengers) };

    const counts = await RideModel.aggregate([
      { $match: match },
      { $group: { _id: "$type", count: { $sum: 1 } } },
    ]);

    return res.status(200).json({ success: true, counts });
  } catch (error) {
    console.error("Error in getRideCounts:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};


export const rateRide = async (req, res) => {
  const { rideId, score, comment } = req.body;
  const raterId = req.user._id; // assume JWT auth middleware

  // 1) Create rating
  const ride = await RideModel.findById(rideId);
  if (!ride) return res.status(404).json({ success: false, message: "Ride not found" });
  const rateeId = ride.driver;

  const rating = await RatingModel.create({
    ride: rideId,
    rater: raterId,
    ratee: rateeId,
    score,
    comment,
  });

  // 2) Update ride doc with rating (optional)
  ride.rating = score;
  await ride.save();

  res.json({ success: true, rating });
};
