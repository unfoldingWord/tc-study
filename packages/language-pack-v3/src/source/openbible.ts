/**
 * OpenBible.info Bible Geocoding Data (`data/ancient.jsonl`, CC BY 4.0), as the builder reads it (`spec/fuentes.md`, `ids.md`, "Builder rules: geo").
 * One line is one ancient place. Only four things are read: the `friendly_id`, the TIPNR unique names of `linked_data` (the ids that contain
 * `@`), the `types`, and for each of the `identifications` its `score.time_total` and the `lonlat` of its first resolution. Nothing of the
 * geometry, the images, the verses or the text is read. No Node module is used.
 */

/** One candidate identification of an ancient place: its score (0 to 1000) and its point, longitude and latitude in degrees, when it has one. */
export type ObIdentification = { score: number; lon?: number; lat?: number }

/** One ancient place of OpenBible. `unique`: the TIPNR unique names of its `linked_data`, as written (`Bethel@Gen.12.8`), in file order. */
export type ObPlace = { friendlyId: string; unique: string[]; types: string[]; identifications: ObIdentification[] }

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)

/** The strings under the `id` and `ids` keys of a `linked_data` value, at any depth, that contain `@`. */
function uniqueNames(value: unknown, out: string[]): void {
  if (typeof value === 'string') return
  if (Array.isArray(value)) {
    for (const v of value) uniqueNames(v, out)
    return
  }
  if (!isRecord(value)) return
  for (const [key, v] of Object.entries(value)) {
    if (key === 'id' || key === 'ids') {
      for (const s of Array.isArray(v) ? v : [v]) if (typeof s === 'string' && s.includes('@') && !out.includes(s)) out.push(s)
    } else uniqueNames(v, out)
  }
}

/** `"35.241389,31.922778"` (longitude, latitude) as numbers, or `undefined` for anything else. */
function lonlat(text: unknown): [number, number] | undefined {
  if (typeof text !== 'string') return undefined
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text)
  if (m === null) return undefined
  const lon = Number(m[1])
  const lat = Number(m[2])
  return Math.abs(lon) <= 180 && Math.abs(lat) <= 90 ? [lon, lat] : undefined
}

/** The ancient places of an `ancient.jsonl` text. A line that is not JSON, or has no `friendly_id`, goes to `issues` and is left out. */
export function parseOpenBible(text: string, issues: string[]): ObPlace[] {
  const out: ObPlace[] = []
  let n = 0
  for (const line of text.split('\n')) {
    n++
    if (line.trim() === '') continue
    let d: unknown
    try {
      d = JSON.parse(line)
    } catch {
      issues.push(`openbible: line ${n} is not JSON: left out`)
      continue
    }
    if (!isRecord(d) || typeof d.friendly_id !== 'string' || d.friendly_id === '') {
      issues.push(`openbible: line ${n} has no friendly_id: left out`)
      continue
    }
    const unique: string[] = []
    uniqueNames(d.linked_data, unique)
    const types = Array.isArray(d.types) ? d.types.filter((t): t is string => typeof t === 'string') : []
    const identifications: ObIdentification[] = []
    for (const id of Array.isArray(d.identifications) ? d.identifications : []) {
      if (!isRecord(id)) continue
      const score = isRecord(id.score) && typeof id.score.time_total === 'number' ? id.score.time_total : 0
      const first = Array.isArray(id.resolutions) && isRecord(id.resolutions[0]) ? id.resolutions[0] : undefined
      const point = first === undefined ? undefined : lonlat(first.lonlat)
      identifications.push(point === undefined ? { score } : { score, lon: point[0], lat: point[1] })
    }
    out.push({ friendlyId: d.friendly_id, unique, types, identifications })
  }
  return out
}
