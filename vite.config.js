import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const isDev = process.env.NODE_ENV === 'development' || process.env.npm_lifecycle_event === 'dev';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: isDev ? {
      '/api/leaderboard': {
        target: 'https://id.embark.games/the-finals/leaderboards',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/leaderboard/, '')
      }
    } : undefined
  }
});
