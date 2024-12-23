import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Check if we're in development mode
const isDev = process.env.NODE_ENV === 'development' || process.env.npm_lifecycle_event === 'dev';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: isDev ? {
      // Development proxy configuration
      '/api/leaderboard': {
        target: 'https://id.embark.games/the-finals/leaderboards',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/leaderboard/, '')
      }
    } : undefined // No proxy in production
  }
});
