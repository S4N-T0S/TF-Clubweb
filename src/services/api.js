const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development';

export const API = {
  BASE_URL: isDev ? 'http://localhost:3000' : 'https://api.ogclub.s4nt0s.eu',
  AUTH_TOKEN: 'not-secret', // The API is currently freely available for all to use.
  METHOD: 'POST'
};