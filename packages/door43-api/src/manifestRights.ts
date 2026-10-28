/**
 * The licence a resource container's `manifest.yaml` names (`dublin_core.rights`, e.g. `rights: 'CC BY-SA 4.0'`), read
 * with the plain match every catalog row's licence is read with, or undefined when it names none.
 */
export function manifestRights(manifest: string): string | undefined {
  return manifest.match(/rights:\s*['"]?([^'";\n]+)['"]?/i)?.[1].trim() || undefined
}
