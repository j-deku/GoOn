import prisma from "../config/Db.js";

export const getActivityLogs = async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const {
      page = 1,
      limit = 20,
      user,   // name or email keyword
      action, // action filter
      from,
      to,
      sort = "desc",
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const filters = {};

    if (action) {
      filters.action = { contains: action, mode: "insensitive" };
    }

    if (from || to) {
      filters.createdAt = {};
      if (from) filters.createdAt.gte = new Date(from);
      if (to) filters.createdAt.lte = new Date(to);
    }

    const userFilter = user
      ? {
          OR: [
            { name: { contains: user, mode: "insensitive" } },
            { email: { contains: user, mode: "insensitive" } },
          ],
        }
      : undefined;

    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where: {
          ...filters,
          ...(userFilter ? { user: userFilter } : {}),
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              isOnline: true,
              lastLoginAt: true,
              lastActiveAt: true,
            },
          },
        },
        orderBy: { createdAt: sort === "asc" ? "asc" : "desc" },
        skip,
        take: Number(limit),
      }),

      prisma.activityLog.count({
        where: {
          ...filters,
          ...(userFilter ? { user: userFilter } : {}),
        },
      }),
    ]);

    res.json({
      success: true,
      page: Number(page),
      total,
      pages: Math.ceil(total / limit),
      logs,
    });
  } catch (error) {
    console.error("❌ Error fetching activity logs:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
