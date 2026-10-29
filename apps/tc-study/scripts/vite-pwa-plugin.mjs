import { VitePWA } from 'vite-plugin-pwa'

export const pwaPrecacheIgnores = ['**/preloaded/**', '**/passage-sets/**']

export const pwaNavigateFallbackDenylist = [
  /^\/assets\//,
  /^\/fonts\//,
  /^\/manifest\.json$/,
  /^\/sw\.js$/,
  /^\/workbox-[^/]+\.js$/,
]

/** Shared VitePWA config — vite.config.js loads before .ts; keep a single source here. */
export function createTcStudyPwaPlugin() {
  return VitePWA({
    strategies: 'generateSW',
    registerType: 'prompt',
    injectRegister: false,
    manifest: false,
    devOptions: { enabled: false },
    workbox: {
      cleanupOutdatedCaches: true,
      navigateFallback: 'index.html',
      navigateFallbackDenylist: pwaNavigateFallbackDenylist,
      runtimeCaching: [],
      globPatterns: ['**/*.{js,css,html,ico,png,svg,json,woff,woff2,ttf}'],
      globIgnores: pwaPrecacheIgnores,
    },
  })
}
