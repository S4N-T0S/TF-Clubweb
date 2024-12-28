import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const isDev = process.env.NODE_ENV === 'development' || process.env.npm_lifecycle_event === 'dev';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: isDev ? {
      '/api/leaderboard': {
        target: 'http://127.0.0.1:8787',  // Wrangler dev server
        changeOrigin: true
      }
    } : undefined
  }
});