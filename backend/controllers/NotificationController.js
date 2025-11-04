import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Create a new notification
 */
export const createNotification = async (req, res) => {
  try {
    const {
      userId,
      rideId,
      bookingId,
      title,
      body,
      message,
      type,
      data,
      extra,
    } = req.body;

    if (!userId || !title || !body) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields (userId, title, body)" });
    }

    const newNotification = await prisma.notification.create({
      data: {
        userId: Number(userId),
        rideId: rideId ? Number(rideId) : null,
        bookingId: bookingId ? Number(bookingId) : null,
        title,
        body,
        message: message || "Welcome back to TOLI-TOLI. Start booking your rides now!",
        type: type || "SYSTEM",
        data: data ? JSON.parse(JSON.stringify(data)) : null,
        extra: extra ? JSON.parse(JSON.stringify(extra)) : null,
        status: "PENDING",
      },
    });

    return res.status(201).json({ success: true, notification: newNotification });
  } catch (error) {
    console.error("Error creating notification:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * Get all notifications for a specific user
 */
export const getNotifications = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ success: false, message: "Missing userId" });
    }

    const notifications = await prisma.notification.findMany({
      where: { userId: Number(userId) },
      orderBy: { createdAt: "desc" },
    });

    return res.json({ success: true, notifications });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * Mark a notification as read
 */
export const markNotificationRead = async (req, res) => {
  try {
    const { notificationId } = req.body;

    if (!notificationId) {
      return res.status(400).json({ success: false, message: "Missing notificationId" });
    }

    const updated = await prisma.notification.update({
      where: { id: Number(notificationId) },
      data: { isRead: true, status: "SENT" },
    });

    return res.status(200).json({ success: true, notification: updated });
  } catch (error) {
    console.error("Error marking notification read:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * Delete a single notification
 */
export const deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.body;

    if (!notificationId) {
      return res.status(400).json({ success: false, message: "Missing notificationId" });
    }

    await prisma.notification.delete({
      where: { id: Number(notificationId) },
    });

    return res.status(200).json({ success: true, message: "Notification deleted" });
  } catch (error) {
    console.error("Error deleting notification:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * Clear all notifications for a user
 */
export const clearAllNotifications = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ success: false, message: "Missing userId" });
    }

    await prisma.notification.deleteMany({
      where: { userId: Number(userId) },
    });

    return res.status(200).json({ success: true, message: "All notifications cleared" });
  } catch (error) {
    console.error("Error clearing notifications:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * Paginated notifications (for logged-in user)
 */
export const listNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized user" });
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: Number(userId) },
        orderBy: { createdAt: "desc" },
        skip,
        take: Number(limit),
      }),
      prisma.notification.count({ where: { userId: Number(userId) } }),
    ]);

    return res.json({
      success: true,
      notifications,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (error) {
    console.error("Error listing notifications:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
