// Constants
export const URL_HASH_REPLACEMENT = '+';  // Separator for username/discriminator
export const COMPARE_SEPARATOR = '&';     // Separator for multiple users

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
  // - Must not contain our URL separators
  // - Must not be only special characters
  if (!/^(?=.*[\p{L}0-9])[\p{L}0-9._-]+$/u.test(name) || 
      name.includes(URL_HASH_REPLACEMENT) || 
      name.includes(COMPARE_SEPARATOR)) return false;
  
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
  return username.replace('#', URL_HASH_REPLACEMENT);
};

// Format multiple usernames for URL
export const formatMultipleUsernamesForUrl = (mainUsername, compareUsernames = []) => {
  const formattedMain = formatUsernameForUrl(mainUsername);
  if (!compareUsernames.length) return formattedMain;
  
  const formattedCompare = compareUsernames
    .map(username => formatUsernameForUrl(username))
    .join(COMPARE_SEPARATOR);
    
  return `${formattedMain}${COMPARE_SEPARATOR}${formattedCompare}`;
};

// Parse and validate username from URL
export const parseUsernameFromUrl = (urlUsername) => {
  if (!urlUsername || typeof urlUsername !== 'string') return '';
  
  // Replace our URL pattern back to #
  const potentialUsername = urlUsername.replace(URL_HASH_REPLACEMENT, '#');
  
  // Validate the resulting username
  if (!isValidEmbarkId(potentialUsername)) {
    throw new Error('Invalid username format in URL');
  }
  
  return potentialUsername;
};

// Parse multiple usernames from URL
export const parseMultipleUsernamesFromUrl = (urlString) => {
  if (!urlString || typeof urlString !== 'string') return { main: null, compare: [] };
  
  const usernames = urlString.split(COMPARE_SEPARATOR);
  const mainUsername = safeParseUsernameFromUrl(usernames[0]);
  
  const compareUsernames = usernames
    .slice(1, 6) // Limit to 5 comparison usernames
    .map(safeParseUsernameFromUrl)
    .filter(Boolean); // Remove any invalid usernames
    
  return {
    main: mainUsername,
    compare: compareUsernames
  };
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