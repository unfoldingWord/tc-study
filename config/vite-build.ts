/**
 * Shared Vite build configuration for the monorepo.
 *
 * Control minification from the root:
 * - Normal build: minify: true
 * - Debug build: run with DEBUG_BUILD=1 to disable minification
 *
 * Usage: bun run build        → minified (production)
 *        bun run build:debug  → unminified (easier debugging)
 */
const isDebugBuild =
  process.env.DEBUG_BUILD === '1' ||
  process.env.DEBUG_BUILD === 'true' ||
  process.env.DEBUG_BUILD === 'yes'

export const minify = !isDebugBuild

/**
 * Shared build options to spread into Vite config.
 * Use: ...getSharedBuildConfig()
 */
export function getSharedBuildConfig() {
  return {
    esbuild: {
      minify,
      drop: [],
    },
    build: {
      minify,
      sourcemap: true,
      rollupOptions: {
        output: {
          compact: !isDebugBuild,
        },
      },
    },
  }
}
