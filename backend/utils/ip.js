// utils/ip.js
export const normalizeIP = (ipRaw) => {
  let ip = ipRaw || '';
  if (ip.includes(',')) ip = ip.split(',')[0].trim();
  if (ip === '::1') return '127.0.0.1';
  return ip.trim();
};
