// /ping route
import {connection as redis} from '../queues/connection.js';

const connectionCheck = async (req, res) => {
  try {
    const redisStatus = await redis.ping();

    if (redisStatus !== 'PONG') throw new Error('Redis not responding');

    res.status(200).json({ status: 'ok', source: 'backend', redis: 'connected' });
  } catch (err) {
    res.status(503).json({
      status: 'unhealthy',
      error: err.message || 'Dependency failure',
    });
  }
};

export default connectionCheck;