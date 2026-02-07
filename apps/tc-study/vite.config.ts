import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Alias workspace packages to their source
      '@bt-synergy/navigation': path.resolve(__dirname, '../../packages/navigation/src/index.ts'),
      '@bt-synergy/study-store': path.resolve(__dirname, '../../packages/study-store/src/index.ts'),
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['linked-panels'],
  },
  esbuild: {
    minify: false,
    drop: [],
  },
  build: {
    sourcemap: true,
    minify: false,
    rollupOptions: {
      output: {
        compact: false,
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
})
