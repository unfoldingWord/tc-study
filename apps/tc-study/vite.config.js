import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { getSharedBuildConfig } from '../../config/vite-build'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const { getUsfmToolsViteResolve } = require('./scripts/usfm-tools-vite-aliases.cjs')
const usfmTools = getUsfmToolsViteResolve()

// Build id: set VITE_DEPLOY_VERSION before build for reproducible deploys; otherwise build timestamp
const deployVersion =
  process.env.VITE_DEPLOY_VERSION ||
  new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')

/**
 * NOTE: Vite resolves vite.config.js before vite.config.ts when both exist.
 * Keep this file as the SoT for preview/e2e builds, and mirror critical
 * resolve.dedupe / linked-panels alias from vite.config.ts.
 *
 * linked-panels uses a module-level store singleton — duplicate physical copies
 * (app vs resource-panels nested installs) cause:
 * `useLinkedPanelsStore must be used within a LinkedPanelsContainer`.
 * Alias + dedupe force one instance for shells and @bt-synergy/resource-panels.
 *
 * @usfm-tools/*: see scripts/usfm-tools-vite-aliases.cjs + packages/usj-processor/scripts/link-usfm-tools.cjs
 */
const linkedPanelsEntry = path.resolve(
  __dirname,
  '../../node_modules/linked-panels/dist/index.js'
)
const sharedBuild = getSharedBuildConfig()

export default defineConfig({
  define: {
    __DEPLOY_VERSION__: JSON.stringify(deployVersion),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Force single linked-panels copy (root install shared with resource-panels)
      'linked-panels': linkedPanelsEntry,
      // Alias workspace packages to their source
      '@bt-synergy/navigation': path.resolve(__dirname, '../../packages/navigation/src/index.ts'),
      ...usfmTools.alias,
    },
    // Critical: prevent dual React / dual linked-panels singletons
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
    // usfm-ast CJS dist may sit outside node_modules (alias). Without this,
    // Rollup leaves `exports` bare → "exports is not defined" when resourceTypes load.
    commonjsOptions: {
      include: usfmTools.commonjsInclude,
    },
    rollupOptions: {
      ...sharedBuild.build?.rollupOptions,
      output: {
        ...sharedBuild.build?.rollupOptions?.output,
        // Keep store singleton out of arbitrary viewer chunks (e.g. WordLinkCard)
        manualChunks(id) {
          if (
            id.includes('node_modules/linked-panels') ||
            id.includes(`${path.sep}linked-panels${path.sep}`)
          ) {
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
      allow: [path.resolve(__dirname, '../..'), ...usfmTools.fsAllow],
    },
  },
})
