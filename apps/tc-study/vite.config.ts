import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vite'
import checker from 'vite-plugin-checker'
import { getSharedBuildConfig } from '../../config/vite-build'

// Build id: set VITE_DEPLOY_VERSION before build for reproducible deploys; otherwise build timestamp
const deployVersion =
  process.env.VITE_DEPLOY_VERSION ||
  new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')

// Prefer keeping resolve.dedupe in sync with vite.config.js — Vite loads .js first when both exist.
/**
 * Keep in sync with vite.config.js (Vite prefers .js when both exist).
 * linked-panels module store must be a single instance — see vite.config.js comment.
 */
const linkedPanelsEntry = path.resolve(
  __dirname,
  '../../node_modules/linked-panels/dist/index.js'
)
// Sibling usfm-ast (USJ pipeline bridge — @bt-synergy/usj-processor imports dist/)
const usfmAstRoot = path.resolve(__dirname, '../../../usfm-ast')
const usfmToolsParser = path.resolve(usfmAstRoot, 'packages/usfm-parser/dist/index.js')
const usfmToolsTypes = path.resolve(usfmAstRoot, 'packages/shared-types/dist/index.js')
const usfmToolsUsjCore = path.resolve(usfmAstRoot, 'packages/usfm-usj-core/dist/index.mjs')
const sharedBuild = getSharedBuildConfig()

export default defineConfig({
  define: {
    __DEPLOY_VERSION__: JSON.stringify(deployVersion),
  },
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
      'linked-panels': linkedPanelsEntry,
      // Alias workspace packages to their source (so dev uses latest code without rebuilding packages)
      '@bt-synergy/navigation': path.resolve(__dirname, '../../packages/navigation/src/index.ts'),
      // Resolve @usfm-tools/* for CJS parser requires inside usj-processor bridge
      '@usfm-tools/parser': usfmToolsParser,
      '@usfm-tools/types': usfmToolsTypes,
      '@usfm-tools/usj-core': usfmToolsUsjCore,
    },
    dedupe: ['react', 'react-dom', 'linked-panels'],
  },
  optimizeDeps: {
    include: [
      'linked-panels',
      '@bt-synergy/cache-adapter-indexeddb',
      '@usfm-tools/parser',
      '@usfm-tools/types',
    ],
    needsInterop: ['@usfm-tools/parser', '@usfm-tools/types'],
  },
  ...sharedBuild,
  // Workers use dynamic imports (download manager / loaders). Default IIFE cannot
  // code-split; ES matches `new Worker(..., { type: 'module' })` in hooks.
  worker: {
    format: 'es',
  },
  build: {
    ...sharedBuild.build,
    rollupOptions: {
      ...sharedBuild.build?.rollupOptions,
      output: {
        ...sharedBuild.build?.rollupOptions?.output,
        manualChunks(id) {
          if (id.includes('node_modules/linked-panels') || id.includes(`${path.sep}linked-panels${path.sep}`)) {
            return 'linked-panels'
          }
        },
      },
    },
  },
  server: {
    port: 3000,
    open: true,
    fs: {
      allow: [path.resolve(__dirname, '../..'), usfmAstRoot],
    },
  },
})
