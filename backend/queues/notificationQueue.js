// queues/NotificationQueue.js

import { Queue } from 'bullmq';
import { connection } from './connection.js';
import logger from '../middlewares/logger.js';

export const notificationQueue = new Queue('notifications', {
  connection,
  metrics:false,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000, 
    },
    removeOnComplete: { age: 3600 },
    removeOnFail: { count: 100 },
    timeout: 60000,
  },
});
notificationQueue.on('error', (err) => {
  logger.error('🔴 Notification Queue Error (BullMQ):', {
    message: err.message,
    stack: err.stack,
  });
});
notificationQueue.on('paused', () => {
  logger.info('Notification Queue paused.');
});
notificationQueue.on('resumed', () => {
  logger.info('Notification Queue resumed.');
});

notificationQueue.on('drained', () => {
  logger.info('Notification Queue drained (no more jobs to process).');
});