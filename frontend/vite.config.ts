import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const apiTarget = process.env.UPWORK_API_PROXY ?? 'http://127.0.0.1:8765'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_APP_BASE ?? '/',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': apiTarget,
    },
  },
})
