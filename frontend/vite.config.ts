import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode, command }) => {
  // Dynamic environment detection
  // 'command' is 'serve' for dev server, 'build' for production build
  // 'mode' is 'development' or 'production'
  const isDev = command === 'serve' || mode === 'development'
  const isProd = command === 'build' || mode === 'production'
  
  // Use '/' for development, '/assets/healthcare/frontend/' for production
  const base = isDev ? '/' : '/assets/healthcare/frontend/'
  
  return {
    base,
    plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    outDir: '../healthcare/public/frontend',
    emptyOutDir: true,
    target: 'es2015',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/index-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  }
  }
})