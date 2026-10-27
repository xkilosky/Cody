import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    allowedHosts: true,
    hmr: { clientPort: 443 },
    // The same forwarder the deployed app uses, so `npm run dev` behaves like
    // production for providers that send no CORS headers (xKiro).
    proxy: {
      '/api/xkiro': {
        target: 'https://api.xkiro.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path: string) => path.replace(/^\/api\/xkiro/, ''),
      },
    },
  },
  preview: { host: '0.0.0.0' },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: {
          codemirror: [
            '@codemirror/state',
            '@codemirror/view',
            '@codemirror/commands',
            '@codemirror/search',
            '@codemirror/autocomplete',
            '@codemirror/language',
          ],
        },
      },
    },
  },
})
