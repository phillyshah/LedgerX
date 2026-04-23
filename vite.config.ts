import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    // jsPDF v4 ships a PDF engine with embedded fonts — its chunk is inherently ~160 KB gzip.
    // Raising the limit silences the false-positive warning without masking real bloat.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        /**
         * Function form of manualChunks so transitive node_module deps land in
         * the right vendor chunk rather than being re-bundled into app chunks.
         *
         * Groupings (each becomes a separately-cacheable file):
         *  vendor-react   — React + ReactDOM (rarely changes, ~45 KB gzip)
         *  vendor-recharts — Recharts + its entire dep tree: redux toolkit,
         *                    react-redux, victory-vendor, immer, reselect, etc.
         *                    (only loaded by Dashboard / AdminAnalytics)
         *  vendor-supabase — @supabase/* client (stable API surface, ~34 KB gzip)
         *  vendor          — everything else in node_modules (lucide-react,
         *                    jspdf helpers, etc.)
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          // Recharts + its full dependency tree
          if (
            id.includes('/recharts/') ||
            id.includes('/victory-vendor/') ||
            id.includes('/@reduxjs/') ||
            id.includes('/react-redux/') ||
            id.includes('/immer/') ||
            id.includes('/reselect/') ||
            id.includes('/use-sync-external-store/') ||
            id.includes('/eventemitter3/') ||
            id.includes('/decimal.js-light/') ||
            id.includes('/es-toolkit/') ||
            id.includes('/tiny-invariant/')
          ) {
            return 'vendor-recharts';
          }

          // React core
          if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('/scheduler/')) {
            return 'vendor-react';
          }

          // Supabase client
          if (id.includes('/@supabase/')) {
            return 'vendor-supabase';
          }

          // jsPDF (large, only loaded on PDF export — keep separately cacheable)
          if (id.includes('/jspdf/') || id.includes('/fflate/') || id.includes('/html2canvas/')) {
            return 'vendor-pdf';
          }

          // Everything else (lucide-react, etc.)
          return 'vendor';
        },
      },
    },
  },
});
