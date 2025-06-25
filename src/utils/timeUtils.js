/**
 * Formats a date object or a date string into a "time ago" string.
 * @param {Date|string|number} date - The date to format.
 * @returns {string} A string like "5 minutes ago", "2 hours ago", etc.
 */
export const formatTimeAgo = (date) => {
  if (!date) return '';
  // Timestamps from the API are in milliseconds, which new Date() handles correctly.
  const d = new Date(date);
  if (isNaN(d.getTime())) return ''; // Invalid date check

  const seconds = Math.floor((new Date() - d) / 1000);

  if (seconds < 5) return 'just now';

  let interval = seconds / 31536000;
  if (interval > 1) {
    const years = Math.floor(interval);
    return `${years} year${years > 1 ? 's' : ''} ago`;
  }
  interval = seconds / 2592000;
  if (interval > 1) {
    const months = Math.floor(interval);
    return `${months} month${months > 1 ? 's' : ''} ago`;
  }
  interval = seconds / 86400;
  if (interval > 1) {
    const days = Math.floor(interval);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
  interval = seconds / 3600;
  if (interval > 1) {
    const hours = Math.floor(interval);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  }
  interval = seconds / 60;
  if (interval > 1) {
    const minutes = Math.floor(interval);
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  }
  return `${Math.floor(seconds)} second${Math.floor(seconds) > 1 ? 's' : ''} ago`;
};

/**
 * Formats a duration in milliseconds into a human-readable string.
 * e.g., "2 days, 5 hours", "1 hour, 30 minutes"
 * @param {number} ms - The duration in milliseconds.
 * @returns {string} A formatted duration string.
 */
export const formatDuration = (ms) => {
  if (typeof ms !== 'number' || ms < 0) return '';

  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) {
    const dayString = `${days} day${days !== 1 ? 's' : ''}`;
    const hourString = hours > 0 ? `, ${hours} hour${hours !== 1 ? 's' : ''}` : '';
    return `${dayString}${hourString}`;
  }
  if (hours > 0) {
    const hourString = `${hours} hour${hours !== 1 ? 's' : ''}`;
    const minuteString = minutes > 0 ? `, ${minutes} minute${minutes !== 1 ? 's' : ''}` : '';
    return `${hourString}${minuteString}`;
  }
  if (minutes > 0) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
  
  const seconds = totalSeconds % 60;
  if (seconds > 0) {
    return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  }
  
  return 'less than a minute';
};