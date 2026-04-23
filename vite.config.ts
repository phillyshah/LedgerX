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
         *  vendor-recharts — Recharts + its entire dep tree: redux toolkit,
         *                    react-redux, victory-vendor, immer, reselect, etc.
         *                    (only loaded by Dashboard / AdminAnalytics)
         *  vendor-supabase — @supabase/* client (stable API surface, ~34 KB gzip)
         *  vendor-pdf     — jsPDF + html2canvas + fflate (only loaded on PDF export)
         *  vendor         — React + ReactDOM + lucide-react + everything else.
         *                   React is intentionally NOT split out: lucide-react
         *                   and other consumers call React.forwardRef at module
         *                   init, and a separate chunk breaks initialization order.
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

          // Supabase client
          if (id.includes('/@supabase/')) {
            return 'vendor-supabase';
          }

          // jsPDF (large, only loaded on PDF export — keep separately cacheable)
          if (id.includes('/jspdf/') || id.includes('/fflate/') || id.includes('/html2canvas/')) {
            return 'vendor-pdf';
          }

          // pdfjs-dist — only loaded when a contractor scans a PDF invoice/receipt.
          // Dynamically imported from src/lib/pdfToImage.ts; keeping it in its own
          // chunk avoids shipping the ~300KB parser to users who never scan a PDF.
          if (id.includes('/pdfjs-dist/')) {
            return 'vendor-pdfjs';
          }

          // Everything else — including React core and lucide-react.
          // IMPORTANT: Do NOT split React into its own chunk. Libraries like
          // lucide-react reference React.forwardRef at module init; if React
          // lives in a sibling chunk, Rollup's live bindings can evaluate
          // the consumer before React's namespace is populated, crashing the
          // app with "Cannot read properties of undefined (reading 'forwardRef')".
          // Keep React adjacent to its consumers.
          return 'vendor';
        },
      },
    },
  },
});
