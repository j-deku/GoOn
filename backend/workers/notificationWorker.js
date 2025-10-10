""// workers/NotificationWorker.js
import { Worker } from 'bullmq';
import { connection } from '../queues/connection.js';
import Notification from '../models/NotificationModel.js'; 
import logger from '../middlewares/logger.js';
import { sendPushNotification, sendPushToTopic } from '../utils/pushNotification.js';

const WORKER_CONCURRENCY = 5; // Process 5 jobs concurrently

export const notificationWorker = new Worker(
  'notifications',
  async job => {
    logger.info(`Processing notification job ${job.id}.`);
    const { title, body, data = {}, topic, scheduledAt } = job.data;

    let notif;
    try {
      notif = await Notification.create({
      userId:    data.userId || null,      
      title:     title,                        
      body:      body,                         
      rideId:    data.rideId || null,
      bookingId: data.bookingId || null,
      message:   body,                          // legacy fallback
      type:      data.type || 'system',
      extra:     data.extra || {},
      scheduledAt,
      status:    'pending',
      attempts:  0,
      });
      logger.info(`Notification ${notif._id} created in DB for job ${job.id}.`);
    } catch (dbErr) {
      logger.error(`❌ Failed to persist notification for job ${job.id} to DB:`, {
        message: dbErr.message,
        stack: dbErr.stack,
        jobData: job.data
      });
      throw new Error(`DB persistence failed for job ${job.id}: ${dbErr.message}`);
    }
    if (!topic && !data.fcmToken) {
      logger.warn(`Job ${job.id}: Neither topic nor FCM token provided for notification. Skipping FCM send.`);
      notif.status = 'skipped';
      notif.lastError = 'Missing topic or FCM token for send.';
      await notif.save();
      return; 
    }

    try {
      logger.info(`Attempting to send FCM for notification ${notif._id} (job ${job.id}).`);

      let response;
      if (topic) {
        response = await sendPushToTopic(topic, { title, body, data });
      } else {
        response = await sendPushNotification(data.fcmToken, { title, body, data });
      }

      logger.info(`FCM sent successfully for notification ${notif._id} (job ${job.id}). Response: ${JSON.stringify(response)}`);

      notif.status = 'sent';
      notif.sentAt = new Date();
      await notif.save();
      logger.info(`Notification ${notif._id} status updated to 'sent'.`);

    } catch (err) {
      logger.error(`❌ Failed to send FCM for notification ${notif._id} (job ${job.id}):`, {
        message: err.message,
        errorCode: err.code, 
        stack: err.stack,
        jobData: job.data,
      });

      notif.status = 'failed';
      notif.attempts = (notif.attempts || 0) + 1; 
      notif.lastError = err.message;
      await notif.save();
      logger.warn(`Notification ${notif._id} status updated to 'failed'. Attempts: ${notif.attempts}`);

      throw err;
    }
  },
  { connection, concurrency: WORKER_CONCURRENCY }
);

notificationWorker.on('failed', (job, err) => {
  logger.error(`❌ Notification job ${job.id} failed after all retries or critically errored:`, {
    message: err.message,
    stack: err.stack,
    jobData: job.data,
  });
});

notificationWorker.on('completed', (job) => {
  logger.info(`✅ Notification job ${job.id} completed successfully.`);
});

notificationWorker.on('active', (job) => {
  logger.debug(`Notification job ${job.id} is now active.`);
});

notificationWorker.on('stalled', (jobId) => {
  logger.warn(`❗ Notification job ${jobId} has stalled. Potential issue.`);
});

const shutdown = async (signal) => {
  logger.info(`${signal} received. Shutting down notification worker gracefully...`);
  try {
    await notificationWorker.close();
    logger.info('Notification worker closed. Exiting process.');
    process.exit(0);
  } catch (error) {
    logger.error('Error during worker shutdown:', error);
    process.exit(1); 
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
