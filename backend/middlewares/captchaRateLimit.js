import { connection as redis } from '../queues/connection.js';

export const captchaRateLimiter = async (req, res, next) => {
  try {
    const getClientIP = (req) => {
      return req.headers["x-forwarded-for"]?.split(',')[0]?.trim() || 
             req.connection.remoteAddress || 
             req.socket.remoteAddress || 
             req.ip || 'unknown';
    };

    const ip = getClientIP(req);
    const attemptKey = `security:captcha:attempts:${ip}`;
    const lockKey = `security:captcha:lock:${ip}`;

    const isLocked = await redis.get(lockKey);
    if (isLocked) {
      return res.status(429).json({ 
        success: false, 
        message: "Too many CAPTCHA failures. Try again later." 
      });
    }

    // Get current attempts
    let attempts = await redis.get(attemptKey);
    attempts = attempts ? parseInt(attempts, 10) : 0;

    if (attempts >= 10) {
      await redis.set(lockKey, "locked", { EX: 60 * 15 });
      await redis.del(attemptKey);
      
      return res.status(429).json({ 
        success: false, 
        message: "Too many CAPTCHA attempts. Please try again in 15 minutes." 
      });
    }
        // Increment attempts & set expiry if new
    await redis.multi()
      .incr(attemptKey)
      .expire(attemptKey, 300) // 5 min window
      .exec();

    next();
    
  } catch (error) {
    console.error('Rate limiter error:', error);
    next();
  }
};