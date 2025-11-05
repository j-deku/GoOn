import prisma from "../config/Db.js";

// helper
const stripAccents = (s = "") =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/**
 * Search available rides
 */
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
    } = req.query;

    const where = {};

    // pickup
    if (pickup) {
      where.pickupNorm = { contains: stripAccents(pickup)};
    }

    // destination
    if (destination) {
      where.destinationNorm = {
        contains: stripAccents(destination),
      };
    }

    // date filter
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const currentTime = now.toTimeString().slice(0, 5);

    if (selectedDate) {
      const d = new Date(selectedDate);
      const start = new Date(d.setHours(0, 0, 0, 0));
      const end = new Date(d.setHours(23, 59, 59, 999));
      where.selectedDate = { gte: start, lte: end };

      const todayString = startOfToday.toISOString().split("T")[0];
      const selString = start.toISOString().split("T")[0];
      if (selString === todayString) {
        where.selectedTime = { gte: currentTime };
      }
    } else {
      where.OR = [
        { selectedDate: { gt: endOfToday } },
        {
          AND: [
            { selectedDate: { gte: startOfToday, lte: endOfToday } },
            { selectedTime: { gte: currentTime } },
          ],
        },
      ];
    }

    // passengers
    if (passengers) where.passengers = { gte: Number(passengers) };

    // type filter
    if (filter && filter.toLowerCase() !== "all") {
      where.type = { equals: filter };
    }

    // sorting
    let orderBy = {};
    if (sort === "earliest") orderBy = { selectedDate: "asc" };
    else if (sort === "lowestPrice") orderBy = { price: "asc" };
    else if (sort === "shortestRide") orderBy = { distance: "asc" };

    // find rides
    const [rides, totalCount] = await Promise.all([
      prisma.ride.findMany({
        where,
        include: { driver: { select: { name: true, avatar: true } } },
        orderBy,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.ride.count({ where }),
    ]);

    const totalPages = Math.ceil(totalCount / Number(limit));

    // aggregate bookings per ride
    const agg = await prisma.booking.groupBy({
      by: ["rideId"],
      where: { status: "APPROVED" },
      _sum: { passengers: true },
    });
    const seatsMap = Object.fromEntries(
      agg.map((a) => [a.rideId, a._sum.passengers || 0])
    );

    const enriched = rides.map((r) => {
      const seatsTaken = seatsMap[r.id] || 0;
      const isFull = seatsTaken >= r.maxPassengers;
      return { ...r, seatsTaken, isFull };
    });

    res.status(200).json({ success: true, rides: enriched, totalPages });
  } catch (error) {
    console.error("Error in searchRides:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get ride counts by type
 */
export const getRideCounts = async (req, res) => {
  try {
    const { pickup, destination, selectedDate, passengers } = req.query;
    const where = {};

    if (pickup) where.pickupNorm = { contains: stripAccents(pickup) };
    if (destination)
      where.destinationNorm = { contains: stripAccents(destination) };
    if (selectedDate) {
      const d = new Date(selectedDate);
      const start = new Date(d.setHours(0, 0, 0, 0));
      const end = new Date(d.setHours(23, 59, 59, 999));
      where.selectedDate = { gte: start, lte: end };
    }
    if (passengers) where.passengers = { gte: Number(passengers) };

    const counts = await prisma.ride.groupBy({
      by: ["type"],
      where,
      _count: { _all: true },
    });

    // ✅ normalize the output for frontend compatibility
    const formatted = counts.map((item) => ({
      _id: item.type,
      count: item._count._all,
    }));

    res.status(200).json({ success: true, counts: formatted });
  } catch (error) {
    console.error("Error in getRideCounts:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * Rate a ride
 */
export const rateRide = async (req, res) => {
  try {
    const { rideId, score, comment } = req.body;
    const raterId = req.user.id; // assuming JWT middleware sets req.user

    const ride = await prisma.ride.findUnique({ where: { id: Number(rideId) } });
    if (!ride) return res.status(404).json({ success: false, message: "Ride not found" });

    const rateeId = ride.driverId;

    const rating = await prisma.rating.create({
      data: {
        rideId: Number(rideId),
        raterId,
        rateeId,
        score,
        comment,
      },
    });

    await prisma.ride.update({
      where: { id: Number(rideId) },
      data: { rating: score },
    });

    res.json({ success: true, rating });
  } catch (error) {
    console.error("Error in rateRide:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
