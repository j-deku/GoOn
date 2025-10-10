// Simple logger wrapper. Swap with winston/pino/datadog/sentry/etc as needed
export const logger = {
  info: (...args) => console.info("[INFO]", ...args),
  warn: (...args) => console.warn("[WARN]", ...args),
  error: (...args) => console.error("[ERROR]", ...args),
};