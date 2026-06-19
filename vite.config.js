import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { mapTunerPlugin } from './tools/vite-map-tuner.js';

export default defineConfig({
  // mmdb-lib (offline GeoIP, lazy-loaded in the vault) imports Node's `net` for IP validation; pointed at a tiny browser shim.
  resolve: {
    alias: {
      net: fileURLToPath(new URL('./src/vault/lib/net-shim.js', import.meta.url)),
    },
  },
  plugins: [
    react(),
    mapTunerPlugin(),
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
    rolldownOptions: {
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