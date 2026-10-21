/** True only for `bun run build:debug` (DEBUG_BUILD=1). Dev and production builds are false. */
export function isDebugBuild(): boolean {
  return import.meta.env.VITE_DEBUG_BUILD === '1'
}
