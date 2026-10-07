import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // The browser only ever talks to this origin; /api is forwarded to the
    // backend. That keeps the login cookie same-origin (no CORS, and the
    // backend's CSRF check, which compares Origin with Host, works unchanged).
    // Do NOT set changeOrigin: the Host header must stay as the browser sent it.
    // (Vite's string shorthand silently turns changeOrigin ON, which rewrites
    // Host to localhost:3000 and makes the CSRF check refuse every request —
    // so the long form with changeOrigin: false is required.)
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: false }
    }
  }
})
