/**
 * Resolve USE_USJ_PIPELINE feature flag.
 *
 * Strategy: USJ **replaces** usfm-js as the parse SoT. Dual-path is transitional only.
 *
 * Precedence (first explicit wins):
 * 1. Loader constructor option `useUsjPipeline`
 * 2. process.env.USE_USJ_PIPELINE / VITE_USE_USJ_PIPELINE
 * 3. Default: **true** (USJ path — `@bt-synergy/usj-processor`)
 *
 * Opt out (legacy usfm-js rollback): "0", "false", "no" (case-insensitive),
 * or `useUsjPipeline: false`.
 *
 * Truthy env values: "1", "true", "yes" (case-insensitive).
 */

export type UseUsjPipelineOption = boolean | undefined

function envFlagTruthy(value: string | undefined): boolean | undefined {
  if (value === undefined || value === '') return undefined
  const v = value.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  return undefined
}

function readEnvUseUsjPipeline(): boolean | undefined {
  try {
    // Bun / Node / Vite-injected process.env
    const env = typeof process !== 'undefined' ? process.env : undefined
    const fromUse = envFlagTruthy(env?.USE_USJ_PIPELINE)
    if (fromUse !== undefined) return fromUse
    const fromVite = envFlagTruthy(env?.VITE_USE_USJ_PIPELINE)
    if (fromVite !== undefined) return fromVite
  } catch {
    /* ignore */
  }
  return undefined
}

/**
 * @param option - Explicit loader config override (wins over env when defined)
 */
export function resolveUseUsjPipeline(option?: UseUsjPipelineOption): boolean {
  if (typeof option === 'boolean') return option
  return readEnvUseUsjPipeline() ?? true
}
