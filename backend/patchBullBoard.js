// patchBullBoard.js (already imported in server.js)
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter.js';

// Monkey-patch: prevent BullBoard from calling redis "info"
BullMQAdapter.prototype.getRedisInfo = async function () {
  return {
    redis_version: 'upstash',
    role: 'serverless',
    uptime_in_days: 0,
  };
};

// Optional: silence only NOPERM: info errors in logs
const origConsoleError = console.error;
console.error = function (...args) {
  if (
    args[0] instanceof Error &&
    args[0].message &&
    args[0].message.includes("NOPERM this user has no permissions to run the 'info'")
  ) {
    return; // swallow the error
  }
  origConsoleError.apply(console, args);
};