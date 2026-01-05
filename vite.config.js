import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Manually compress all frontend historical json data into 1 large file for better caching + compression.
          if (id.includes('src/data/')) {
            return 'historical-data';
          }
        },
      },
    },
  },
});