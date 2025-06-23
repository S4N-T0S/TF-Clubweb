/**
 * Formats a date object or a date string into a "time ago" string.
 * @param {Date|string|number} date - The date to format.
 * @returns {string} A string like "5 minutes ago", "2 hours ago", etc.
 */
export const formatTimeAgo = (date) => {
  if (!date) return '';
  if (!(date instanceof Date)) {
    date = new Date(date);
  }

  const seconds = Math.floor((new Date() - date) / 1000);

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
  return `${Math.floor(seconds)} second${seconds > 1 ? 's' : ''} ago`;
};