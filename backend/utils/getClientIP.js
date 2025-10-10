// getClientIP.js
export function getClientIP(req) {
  let ip;

  // 1. Prefer Express's built-in (respects trust proxy)
  if (req.ip) {
    ip = req.ip;
  }

  // 2. Explicit X-Forwarded-For from Nginx / proxies
  if (!ip && req.headers['x-forwarded-for']) {
    // Could be a list: "client, proxy1, proxy2"
    ip = req.headers['x-forwarded-for'].split(',')[0].trim();
  }

  // 3. X-Real-IP header from Nginx
  if (!ip && req.headers['x-real-ip']) {
    ip = req.headers['x-real-ip'];
  }

  // 4. Direct connection remote address
  if (!ip && req.connection && req.connection.remoteAddress) {
    ip = req.connection.remoteAddress;
  }

  // 5. Normalize IPv6 loopback to IPv4 for local testing
  if (ip === '::1') ip = '127.0.0.1';

  // 6. Strip IPv6 prefix if present (e.g., "::ffff:192.168.0.1")
  if (ip && ip.startsWith('::ffff:')) {
    ip = ip.replace('::ffff:', '');
  }

  return ip || '0.0.0.0'; // fallback
}
