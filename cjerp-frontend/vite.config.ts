import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5015',
        changeOrigin: true,
        secure: false,
        ws: false,
        timeout: 60000,
        proxyTimeout: 60000,
        configure: (proxy) => {
          proxy.on('error', (error) => {
            console.error('[vite-proxy] error', error.message)
          })
        },
      },
    },
  },

  resolve: {
    alias: {
      src: path.resolve(__dirname, './src'),
    },
  },
})
