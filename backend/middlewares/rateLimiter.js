// middlewares/rateLimiter.js
import rateLimit from 'express-rate-limit';
import { getClientIP } from '../utils/getClientIP.js';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, 
  keyGenerator: (req) => getClientIP(req)
});

const AdminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, 
  keyGenerator: (req) => getClientIP(req)
});

const DriverLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, 
  keyGenerator: (req) => getClientIP(req)
});
export { AdminLoginLimiter, limiter, DriverLimiter };