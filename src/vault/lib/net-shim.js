// Browser shim for Node's `net`, aliased in vite.config.js.
// mmdb-lib only uses net.isIP() to validate addresses before lookup.
export function isIPv4(ip) {
  if (typeof ip !== 'string') return false;
  const p = ip.split('.');
  return p.length === 4 && p.every((o) => /^\d{1,3}$/.test(o) && Number(o) <= 255);
}
export function isIPv6(ip) {
  return typeof ip === 'string' && ip.includes(':') && /^[0-9a-f:.]+$/i.test(ip);
}
export function isIP(ip) {
  return isIPv4(ip) ? 4 : isIPv6(ip) ? 6 : 0;
}
export default { isIP, isIPv4, isIPv6 };
