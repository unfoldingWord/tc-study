/**
 * The `geo` table of the common topics (`spec/ids.md`, "Builder rules: geo"): the point, the certainty and the form of each place. The point comes
 * from OpenBible.info when it has the place (with how sure it is), else from TIPNR's own link; the form from the type ACAI gives the place, else
 * the type OpenBible gives. No Node module is used.
 */
import type { GeoForm, GeoPoint, GeoSure, Topic } from '../../model'
import type { AcaiPlace } from '../../source/acai'
import type { ObPlace } from '../../source/openbible'
import type { TipnrRecord } from '../../source/tipnr'

/** The form of each place type of ACAI and of OpenBible.info (`ids.md`): 1 point, 2 area, 3 water, 4 height. A type that is not here is form 1 and goes to the report. */
export const FORM_OF_TYPE: Readonly<Record<string, GeoForm>> = Object.freeze({
  // 1 point
  town: 1, city: 1, village: 1, settlement: 1, campsite: 1, gate: 1, well: 1, structure: 1, seaport: 1, fortification: 1, field: 1, tree: 1, road: 1,
  wall: 1, garden: 1, hall: 1, porch: 1, tower: 1, rock: 1, altar: 1, room: 1, mine: 1, ford: 1, 'stone heap': 1, canal: 1, cliff: 1, promontory: 1,
  'district in settlement': 1, special: 1, other: 1,
  // 2 area
  region: 2, nation: 2, province: 2, district: 2, wilderness: 2, territory: 2, valley: 2, plain: 2, peninsula: 2, island: 2, 'natural area': 2,
  'people group': 2, 'geographical feature': 2, forest: 2,
  // 3 water
  river: 3, sea: 3, lake: 3, spring: 3, 'body of water': 3, pool: 3, wadi: 3,
  // 4 height
  mountain: 4, hill: 4, 'mountain range': 4, 'mountain ridge': 4, 'mountain pass': 4,
})

/** The ref of a TIPNR place without its range suffix: the text after the first `-` that follows `@` goes (`Bethel@Gen.12.8-Zec` is `Bethel@Gen.12.8`). */
export function refBase(ref: string): string {
  const at = ref.indexOf('@')
  if (at < 0) return ref
  const dash = ref.indexOf('-', at)
  return dash < 0 ? ref : ref.slice(0, dash)
}

/** `Bethel@Gen.12.8-Zec` is `Bethel`. */
const nameOf = (ref: string): string => ref.split('@')[0].trim()

/** The point of an OpenBible record: its identification with the highest score that has a point (the first of equals), and how many identifications the record has. */
function bestPoint(r: ObPlace): { score: number; lat: number; lon: number; n: number } | undefined {
  let best: { score: number; lat: number; lon: number } | undefined
  for (const id of r.identifications) {
    if (id.lat === undefined || id.lon === undefined) continue
    if (best === undefined || id.score > best.score) best = { score: id.score, lat: id.lat, lon: id.lon }
  }
  return best === undefined ? undefined : { ...best, n: r.identifications.length }
}

/** How sure a point is (`ids.md`): from the score of the identification chosen and the number of identifications of the record. */
export function sureOf(score: number, n: number): GeoSure {
  if (score >= 900 && n === 1) return 3
  return score >= 500 ? 2 : 1
}

/** The distance in kilometres between two points in degrees (haversine, Earth radius 6371 km). */
export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Degrees x 100: `Math.round` of the float64 product (half toward +infinity); `+ 0` turns a -0 into 0. */
const scaled = (degrees: number): number => Math.round(degrees * 100) + 0

/**
 * The `geo` of every place of `topics` (kind place, id `lug:`). `lugOfRef` and `acaiByLug` are the joins the caller made; `records` are the TIPNR
 * records (their `point` is the fallback). `stats` has what the report says.
 */
export function buildGeo(o: {
  topics: Map<string, Topic>
  records: TipnrRecord[]
  openbible?: ObPlace[]
  acaiByLug?: Map<string, AcaiPlace>
  report: string[]
}): { geo: Record<string, GeoPoint>; fromOpenBible: number } {
  const lugs = [...o.topics].filter(([id, t]) => t.kind === 'place' && id.startsWith('lug:'))
  const byBase = new Map<string, string[]>()
  const byName = new Map<string, string[]>()
  for (const [id, t] of lugs) {
    for (const [map, key] of [[byBase, refBase(t.ref)], [byName, nameOf(t.ref)]] as const) {
      const list = map.get(key)
      if (list === undefined) map.set(key, [id])
      else list.push(id)
    }
  }
  // Step 1: each OpenBible record to the one lug it names
  const candidates = new Map<string, ObPlace[]>()
  const ambiguous: string[] = []
  let joined = 0
  for (const r of o.openbible ?? []) {
    let found = [...new Set(r.unique.flatMap((u) => byBase.get(u) ?? []))]
    if (found.length === 0) found = [...new Set(r.unique.flatMap((u) => ((byName.get(u.split('@')[0].trim()) ?? []).length === 1 ? byName.get(u.split('@')[0].trim())! : [])))]
    if (found.length === 0) continue
    if (found.length > 1) {
      ambiguous.push(`${JSON.stringify(r.friendlyId)} (${found.sort().join(', ')})`)
      continue
    }
    joined++
    const list = candidates.get(found[0])
    if (list === undefined) candidates.set(found[0], [r])
    else list.push(r)
  }
  if (ambiguous.length > 0) o.report.push(`review: openbible: ${ambiguous.length} records name more than one place and are not joined: ${ambiguous.join('; ')}`)
  const recordOf = new Map(o.records.map((r) => [r.id, r]))
  const unknownTypes = new Set<string>()
  const out: Record<string, GeoPoint> = {}
  const count = { openbible: 0, tipnr: 0, none: 0, sure: [0, 0, 0, 0], ports: 0 }
  for (const [id, t] of lugs) {
    // Step 2: one record per place
    const usable = (candidates.get(id) ?? []).filter((r) => bestPoint(r) !== undefined)
    const exact = usable.filter((r) => r.friendlyId === nameOf(t.ref))
    const pool = exact.length === 1 ? exact : usable
    let chosen: ObPlace | undefined
    let best: ReturnType<typeof bestPoint>
    for (const r of pool) {
      const p = bestPoint(r)!
      if (best === undefined || p.score > best.score) {
        chosen = r
        best = p
      }
    }
    let lat = 0
    let lon = 0
    let sure: GeoSure = 0
    let wholeDegrees = false
    if (best !== undefined) {
      lat = scaled(best.lat)
      lon = scaled(best.lon)
      sure = sureOf(best.score, best.n)
      count.openbible++
    } else {
      const p = recordOf.get(id)?.point
      if (p !== undefined && !(p.lat === 0 && p.lon === 14)) {
        lat = scaled(p.lat)
        lon = scaled(p.lon)
        sure = 1
        wholeDegrees = Number.isInteger(p.lat) && Number.isInteger(p.lon)
        count.tipnr++
      } else count.none++
    }
    const acaiTypes = o.acaiByLug?.get(id)?.types ?? []
    const type = acaiTypes[0] ?? chosen?.types[0] ?? ([...(candidates.get(id) ?? [])][0]?.types[0] as string | undefined)
    let form: GeoForm = 1
    if (type !== undefined) {
      const f = FORM_OF_TYPE[type]
      if (f === undefined) unknownTypes.add(type)
      else form = f
    }
    if (wholeDegrees) form = 2
    if (form === 1 && acaiTypes.includes('seaport')) {
      form = 5
      count.ports++
    }
    if (sure === 0) lat = lon = 0
    count.sure[sure]++
    out[id] = { lat, lon, sure, form }
  }
  if (unknownTypes.size > 0) o.report.push(`geo: place types that are not in the table of forms (form 1): ${[...unknownTypes].sort().join(', ')}`)
  o.report.push(
    `geo: ${lugs.length} places; ${joined} OpenBible records joined; ${count.openbible} points from OpenBible, ${count.tipnr} from TIPNR, ${count.none} without a point; sure 3: ${count.sure[3]}, 2: ${count.sure[2]}, 1: ${count.sure[1]}, 0: ${count.sure[0]}; ${count.ports} ports`,
  )
  return { geo: out, fromOpenBible: count.openbible }
}
