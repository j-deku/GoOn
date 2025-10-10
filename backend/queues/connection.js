// connection.js

import IORedis from 'ioredis';
import dotenv from 'dotenv';
import logger from '../middlewares/logger.js';

dotenv.config();

if (!process.env.REDIS_URL) {
  logger.error('CRITICAL ERROR: REDIS_URL environment variable is not set. Exiting application.');
  process.exit(1); 
}

export const connection = new IORedis(process.env.REDIS_URL, {
  enableReadyCheck: false,
  enableOfflineQueue: true,
  connectTimeout: 10000,
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    return Math.min(times * 50, 2000);
  }
});
connection.on('connect', () => {
  logger.info('✅ Redis connected successfully.');
});

let redisHealthy = false;

connection.on('connect', () => {
  logger.info('✅ Redis connected successfully.');
});

connection.on('ready', () => {
  redisHealthy = true;
  logger.info('🔵 Redis is ready and healthy.');
});

connection.on('error', (err) => {
  redisHealthy = false;
  logger.error('⚠️ Redis error (will retry, server stays up):', {
    message: err.message,
    stack: err.stack,
  });
  // no process.exit here!
});

connection.on('end', () => {
  redisHealthy = false;
  logger.warn('🔴 Redis connection ended.');
});

connection.on('reconnecting', (delay) => {
  logger.warn(`Redis reconnecting in ${delay}ms...`);
});

connection.on('end', () => {
  logger.info('Redis connection ended.');
});

connection.on('ready', () => {
  logger.info('Redis client is ready.');
});