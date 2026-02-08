import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vite'
import { getSharedBuildConfig } from '../../config/vite-build'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  ...getSharedBuildConfig(),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3001,
  },
  define: {
    'process.env': '{}',
    global: 'globalThis',
  },
  optimizeDeps: {
    exclude: ['@bt-synergy/toc-generator-cli'],
  },
})
