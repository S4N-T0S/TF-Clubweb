// Constants
export const URL_HASH_REPLACEMENT = '+';  // Separator
const GAME_SEPARATOR = '#';

// Validates an Embark ID in its original form (with #)
export const isValidEmbarkId = (id) => {
  if (!id || typeof id !== 'string') return false;
  
  // Split into name and discriminator
  const parts = id.split('#');
  if (parts.length !== 2) return false;
  
  const [name, discriminator] = parts;
  
  // Validate discriminator: must be exactly 4 digits
  if (!/^\d{4}$/.test(discriminator)) return false;
  
  // Validate username:
  // - Must not be empty
  // - Can contain letters (any unicode letter), numbers, dots, dashes, underscores
  // - Must not contain our URL separator
  // - Must not be only special characters
  if (!/^(?=.*[\p{L}0-9])[\p{L}0-9._-]+$/u.test(name) || name.includes(URL_HASH_REPLACEMENT)) return false;
  
  return true;
};

// Sanitize and format username for URL
export const formatUsernameForUrl = (username) => {
  if (!username || typeof username !== 'string') return '';
  
  // First validate the original username
  if (!isValidEmbarkId(username)) {
    throw new Error('Invalid Embark ID format');
  }
  
  // Replace # with our URL-safe pattern
  return username.replace(GAME_SEPARATOR, URL_HASH_REPLACEMENT);
};

// Parse and validate username from URL
export const parseUsernameFromUrl = (urlUsername) => {
  if (!urlUsername || typeof urlUsername !== 'string') return '';
  
  // Replace our URL pattern back to #
  const potentialUsername = urlUsername.replace(URL_HASH_REPLACEMENT, GAME_SEPARATOR);
  
  // Validate the resulting username
  if (!isValidEmbarkId(potentialUsername)) {
    throw new Error('Invalid username format in URL');
  }
  
  return potentialUsername;
};

// Safe parsing utility
export const safeParseUsernameFromUrl = (urlUsername) => {
  try {
    return parseUsernameFromUrl(urlUsername);
  } catch (error) {
    console.error('Failed to parse username from URL:', error);
    return null;
  }
};