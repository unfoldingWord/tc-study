import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { getSharedBuildConfig } from '../../config/vite-build'

// https://vite.dev/config/
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
})