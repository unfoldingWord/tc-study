/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __DEPLOY_VERSION__: string
declare const __TC_V3_KEYS__: Record<string, string> | undefined

interface ImportMetaEnv {
  readonly DEV: boolean
  readonly PROD: boolean
  readonly MODE: string
  /** `'1'` only when the app is built with DEBUG_BUILD=1. */
  readonly VITE_DEBUG_BUILD?: string
  /** `staging` makes format 3 the default; see features/packsV3/packsFormat.ts. */
  readonly VITE_TCS_PACKS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
  readonly glob: (
    pattern: string,
    options?: Record<string, unknown>
  ) => Record<string, () => Promise<unknown>>
}
