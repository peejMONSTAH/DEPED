import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // The app shipped as a single ~2 MB chunk, so every user downloaded the
        // charting, PDF and document-processing libraries before the login screen
        // could render. Splitting the heavy third-party code lets the browser
        // cache it separately from application code, which changes far more often.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('pdfjs-dist') || id.includes('pdf-lib') || id.includes('jspdf')) return 'vendor-pdf';
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory')) return 'vendor-charts';
          if (id.includes('tesseract')) return 'vendor-ocr';
          if (id.includes('react-dom') || id.includes('react-router') || id.includes('/react/')) return 'vendor-react';
          if (id.includes('@tanstack')) return 'vendor-query';
          if (id.includes('lucide-react')) return 'vendor-icons';
          if (id.includes('xlsx') || id.includes('exceljs') || id.includes('docx')) return 'vendor-office';
          return 'vendor';
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true, // Listen on all local IP addresses (0.0.0.0)
    port: 5173,
    allowedHosts: true, // Allow ngrok, Cloudflare, and external tunnel hostnames
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    },
  },
})
