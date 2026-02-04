import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3456,
  },
  resolve: {
    alias: {
      // Force linked-panels to use dist files, not src
      'linked-panels': path.resolve(__dirname, 'node_modules/linked-panels/dist/index.js'),
    },
  },
})
