import { notificationQueue } from "../queues/NotificationQueue.js";

// controllers/debugController.js
export const queueStatus = async (req, res, next) => {
  try {
    // returns e.g. { waiting: 5, active: 2, delayed: 1, completed: 20, failed: 0, paused: 0 }
    const counts = await notificationQueue.getJobCounts();
    return res.json({ success: true, counts });
  } catch (err) {
    next(err);
  }
};
