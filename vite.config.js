import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/leaderboard': {
        target: 'https://id.embark.games/the-finals/leaderboards',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/leaderboard/, '')
      }
    }
  }
});