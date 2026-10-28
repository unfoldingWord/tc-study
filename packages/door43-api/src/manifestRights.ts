/**
 * The licence a resource container's `manifest.yaml` names (`dublin_core.rights`, e.g. `rights: 'CC BY-SA 4.0'`), read
 * with the plain match every catalog row's licence is read with, or undefined when it names none. The value is read
 * from the `rights:` line only: an empty `rights:` names none, and the next line's key is no licence.
 */
export function manifestRights(manifest: string): string | undefined {
  return manifest.match(/rights:[ \t]*['"]?([^'";\r\n]+)['"]?/i)?.[1].trim() || undefined
}
