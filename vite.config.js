import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'generate-version-json',
      // This hook runs during the build process not dev
      generateBundle() {
        const timestamp = Date.now(); 
        
        // Emit the file directly into the dist folder
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ version: timestamp })
        });
      }
    }
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Recoil data is route-specific; make separate chunk.
          if (id.includes('src/data/recoil/')) {
            return;
          }
          // Manually compress all frontend historical json data into 1 large file for better caching + compression.
          if (id.includes('src/data/')) {
            return 'historical-data';
          }
        },
      },
    },
  },
});