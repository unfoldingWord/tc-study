/**
 * The licence a resource container's `manifest.yaml` names (`dublin_core.rights`, e.g. `rights: 'CC BY-SA 4.0'`), read
 * with the plain match every catalog row's licence is read with, or undefined when it names none. Only a line whose
 * key is `rights` names it, and only by its own value: an empty `rights:` names none, nor does the next line's key or
 * `rights:` inside another value.
 */
export function manifestRights(manifest: string): string | undefined {
  return manifest.match(/^[ \t]*rights:[ \t]*['"]?([^'";\r\n]+)['"]?/im)?.[1].trim() || undefined
}
