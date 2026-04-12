/**
 * Formats a date object or a date string into a "time ago" string.
 * @param {Date|string|number} date - The date to format.
 * @param {boolean} short - Whether to use short units (e.g., "mins" vs "minutes").
 * @returns {string} 
 */
export const formatTimeAgo = (date, short = false) => {
  if (!date) return '';
  // Timestamps from the API are in milliseconds, which new Date() handles correctly.
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';

  const seconds = Math.floor((new Date() - d) / 1000);
  if (seconds < 5) return 'just now';

  // Helper to handle pluralization and unit choice
  const getLabel = (value, longUnit, shortUnit) => {
    const unit = short ? shortUnit : longUnit;
    // We add 's' if value > 1 (e.g., 1 min ago vs 2 mins ago)
    return `${value} ${unit}${value > 1 ? 's' : ''} ago`;
  };

  let interval = seconds / 31536000;
  if (interval > 1) return getLabel(Math.floor(interval), 'year', 'yr');
  
  interval = seconds / 2592000;
  if (interval > 1) return getLabel(Math.floor(interval), 'month', 'mo');
  
  interval = seconds / 86400;
  if (interval > 1) return getLabel(Math.floor(interval), 'day', 'day');
  
  interval = seconds / 3600;
  if (interval > 1) return getLabel(Math.floor(interval), 'hour', 'hr');
  
  interval = seconds / 60;
  if (interval > 1) return getLabel(Math.floor(interval), 'minute', 'min');
  
  return getLabel(Math.floor(seconds), 'second', 'sec');
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