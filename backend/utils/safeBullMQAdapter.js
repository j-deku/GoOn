// utils/SafeBullMQAdapter.js
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter.js';

export class SafeBullMQAdapter extends BullMQAdapter {
  // Prevent any call to Redis INFO (BullBoard uses this internally)
  async getRedisInfo() {
    return {
      redis_version: 'upstash', // fake/stub values
      role: 'serverless',
      uptime_in_days: 0,
    };
  }

  // Prevent collection of metrics / heavy stats
  async getMetrics() {
    return {
      count: 0,
      metrics: [],
    };
  }
}
