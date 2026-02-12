import type { UserConfig } from 'vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { getSharedBuildConfig } from '../../config/vite-build'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  ...getSharedBuildConfig(),
  server: {
    port: 5174
  },
  resolve: {
    alias: {
      // Help Vite resolve linked-panels from node_modules
      'linked-panels': path.resolve(__dirname, '../../node_modules/linked-panels/dist/index.js')
    }
  },
  optimizeDeps: {
    include: ['linked-panels']
  }
} as unknown as UserConfig)
