"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.minify = void 0;
exports.getSharedBuildConfig = getSharedBuildConfig;
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
var isDebugBuild = process.env.DEBUG_BUILD === '1' ||
    process.env.DEBUG_BUILD === 'true' ||
    process.env.DEBUG_BUILD === 'yes';
exports.minify = !isDebugBuild;
/**
 * Shared build options to spread into Vite config.
 * Use: ...getSharedBuildConfig()
 */
function getSharedBuildConfig() {
    return {
        esbuild: {
            minify: exports.minify,
            drop: [],
        },
        build: {
            minify: exports.minify,
            sourcemap: true,
            rollupOptions: {
                output: {
                    compact: !isDebugBuild,
                },
            },
        },
    };
}
