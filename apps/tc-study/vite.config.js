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

/** Raw-markdown toggles. Set by `bun run build:debug` (DEBUG_BUILD=1). */
const isDebugBuild =
  process.env.DEBUG_BUILD === '1' ||
  process.env.DEBUG_BUILD === 'true' ||
  process.env.DEBUG_BUILD === 'yes'

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
 * @usfm-tools/*: npm via usj-processor; CJS interop in usfm-tools-vite-aliases.cjs
 */
const linkedPanelsEntry = path.resolve(
  __dirname,
  '../../node_modules/linked-panels/dist/index.js'
)
const sharedBuild = getSharedBuildConfig()

/**
 * micromark's decode-named-character-reference ships index.dom.js (document.createElement)
 * under the "browser" export. Vite optimizeDeps resolves that into prepare.worker →
 * ReferenceError: document is not defined. Alias to the map-based entry.
 */
function resolveDecodeNamedCharRef() {
  try {
    const appRequire = createRequire(path.join(__dirname, 'package.json'))
    const mdast = appRequire.resolve('mdast-util-from-markdown')
    return createRequire(mdast).resolve('decode-named-character-reference/index.js')
  } catch {
    return path.resolve(
      __dirname,
      '../../node_modules/.bun/decode-named-character-reference@1.3.0/node_modules/decode-named-character-reference/index.js'
    )
  }
}
const decodeNamedCharRefEntry = resolveDecodeNamedCharRef()

/** Also rewrite any lingering index.dom.js resolves (worker shared chunks). */
function forceDecodeNamedCharRefNode() {
  return {
    name: 'force-decode-named-char-ref-node',
    enforce: 'pre',
    resolveId(id) {
      if (
        id.includes('decode-named-character-reference') &&
        (id.endsWith('index.dom.js') || id.endsWith('index.dom'))
      ) {
        return decodeNamedCharRefEntry
      }
      return null
    },
  }
}

export default defineConfig({
  define: {
    __DEPLOY_VERSION__: JSON.stringify(deployVersion),
    'import.meta.env.VITE_DEBUG_BUILD': JSON.stringify(isDebugBuild ? '1' : ''),
  },
  plugins: [react(), tailwindcss(), forceDecodeNamedCharRefNode()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Force single linked-panels copy (root install shared with resource-panels)
      'linked-panels': linkedPanelsEntry,
      // Alias workspace packages to their source
      '@bt-synergy/navigation': path.resolve(__dirname, '../../packages/navigation/src/index.ts'),
      '@bt-synergy/catalog-manager/core': path.resolve(
        __dirname,
        '../../packages/catalog-manager/src/core.ts'
      ),
      'decode-named-character-reference': decodeNamedCharRefEntry,
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
    plugins: () => [forceDecodeNamedCharRefNode()],
    resolve: {
      // Prefer package.json "worker" / "default" over "browser" (DOM) exports.
      conditions: ['worker', 'module', 'import', 'default'],
    },
  },
  build: {
    ...sharedBuild.build,
    // CJS @usfm-tools/parser|types: without include, Rollup leaves bare `exports`
    // → "exports is not defined" when resourceTypes load (e2e Journey 4/8).
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
