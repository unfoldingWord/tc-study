import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vite'
import checker from 'vite-plugin-checker'
import { getSharedBuildConfig } from '../../config/vite-build'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Run TypeScript in a worker; errors show in browser overlay + terminal and update on save (HMR)
    checker({
      typescript: true,
      overlay: { initialIsOpen: false },
      terminal: true,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Alias workspace packages to their source (so dev uses latest code without rebuilding packages)
      '@bt-synergy/navigation': path.resolve(__dirname, '../../packages/navigation/src/index.ts'),
      '@bt-synergy/study-store': path.resolve(__dirname, '../../packages/study-store/src/index.ts'),
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: [
      'linked-panels',
      '@bt-synergy/cache-adapter-indexeddb',
    ],
  },
  ...getSharedBuildConfig(),
  server: {
    port: 3000,
    open: true,
  },
})
