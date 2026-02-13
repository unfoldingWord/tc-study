/// <reference types="vite/client" />

declare const __DEPLOY_VERSION__: string

interface ImportMetaEnv {
  readonly DEV: boolean
  readonly PROD: boolean
  readonly MODE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
  readonly glob: (pattern: string, options?: any) => Record<string, () => Promise<any>>
}
