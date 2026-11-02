/**
 * How the Hebrew Bible numbers the verses that the UHB (and Spanish and English Bibles) number otherwise.
 *
 * ## Origin and license
 *
 * The table `HEBREW_NUMBERING` below is copied from the Hebrew numbering table of Taller / Idiomas Puentes
 * (`hebrewNumbering.json`), which takes it from the Paratext standard versification mappings
 * (https://github.com/Copenhagen-Alliance/versification-specification), license CC BY-SA 4.0. It has 144 entries. **This
 * file is not under the MIT license of the package**: the table keeps its own license (CC BY-SA 4.0; credit the
 * Paratext versification project and keep the same license for whoever reuses it).
 *
 * ## What the table says
 *
 * Each entry maps a place (or a run of verses, `a-b`) in the numbering of the UHB, which is the English one (`ours`), to the
 * same place in the Hebrew Bible's numbering (`theirs`): `JON 1:17` is `JON 2:1` there, and a psalm's title, verse 0 in the
 * UHB, is verse 1 or 2 there (`PSA 3:0` is `PSA 3:1`, `PSA 51:0` is `PSA 51:2`). A place that is not in the table is the same in
 * both numberings. The lexicon lists the verses of each sense in the Hebrew Bible's numbering, and the segment holds them in
 * the original's, so the builder needs the inverse: {@link fromHebrewNumbering}.
 *
 * ## The titles that take two verses there
 *
 * The table maps the UHB's `PSA 51:0` (the title) to the Hebrew `PSA 51:2`, and so for Psalms 52, 54 and 60: in the Hebrew
 * Bible the title of these four psalms is verses 1 and 2, and the table lists only the second. Verse 1 is the first line of the
 * same title, so it is also the UHB's verse 0: the inverse maps both Hebrew places to it.
 *
 * No Node module is used.
 */

/** The table: a place or a run of verses in the UHB's numbering, and the same in the Hebrew Bible's. */
export const HEBREW_NUMBERING: Readonly<Record<string, string>> = Object.freeze({
  'GEN 31:55': 'GEN 32:1',
  'GEN 32:1-32': 'GEN 32:2-33',
  'EXO 8:1-4': 'EXO 7:26-29',
  'EXO 8:5-32': 'EXO 8:1-28',
  'EXO 22:1': 'EXO 21:37',
  'EXO 22:2-31': 'EXO 22:1-30',
  'LEV 6:1-7': 'LEV 5:20-26',
  'LEV 6:8-30': 'LEV 6:1-23',
  'NUM 16:36-50': 'NUM 17:1-15',
  'NUM 17:1-13': 'NUM 17:16-28',
  'NUM 29:40': 'NUM 30:1',
  'NUM 30:1-16': 'NUM 30:2-17',
  'DEU 12:32': 'DEU 13:1',
  'DEU 13:1-18': 'DEU 13:2-19',
  'DEU 22:30': 'DEU 23:1',
  'DEU 23:1-25': 'DEU 23:2-26',
  'DEU 29:1': 'DEU 28:69',
  'DEU 29:2-29': 'DEU 29:1-28',
  '1SA 20:42': '1SA 21:1',
  '1SA 21:1-15': '1SA 21:2-16',
  '1SA 23:29': '1SA 24:1',
  '1SA 24:1-22': '1SA 24:2-23',
  '2SA 18:33': '2SA 19:1',
  '2SA 19:1-43': '2SA 19:2-44',
  '1KI 4:21-34': '1KI 5:1-14',
  '1KI 5:1-18': '1KI 5:15-32',
  '1KI 22:43-53': '1KI 22:44-54',
  '2KI 11:21': '2KI 12:1',
  '2KI 12:1-21': '2KI 12:2-22',
  '1CH 6:1-15': '1CH 5:27-41',
  '1CH 6:16-81': '1CH 6:1-66',
  '1CH 12:4-40': '1CH 12:5-41',
  '2CH 2:1': '2CH 1:18',
  '2CH 2:2-18': '2CH 2:1-17',
  '2CH 14:1': '2CH 13:23',
  '2CH 14:2-15': '2CH 14:1-14',
  'NEH 4:1-6': 'NEH 3:33-38',
  'NEH 4:7-23': 'NEH 4:1-17',
  'NEH 7:69-73': 'NEH 7:68-72',
  'NEH 9:38': 'NEH 10:1',
  'NEH 10:1-39': 'NEH 10:2-40',
  'JOB 41:1-8': 'JOB 40:25-32',
  'JOB 41:9-34': 'JOB 41:1-26',
  'PSA 3:0-8': 'PSA 3:1-9',
  'PSA 4:0-8': 'PSA 4:1-9',
  'PSA 5:0-12': 'PSA 5:1-13',
  'PSA 6:0-10': 'PSA 6:1-11',
  'PSA 7:0-17': 'PSA 7:1-18',
  'PSA 8:0-9': 'PSA 8:1-10',
  'PSA 9:0-20': 'PSA 9:1-21',
  'PSA 12:0-8': 'PSA 12:1-9',
  'PSA 13:0-5': 'PSA 13:1-6',
  'PSA 18:0-50': 'PSA 18:1-51',
  'PSA 19:0-14': 'PSA 19:1-15',
  'PSA 20:0-9': 'PSA 20:1-10',
  'PSA 21:0-13': 'PSA 21:1-14',
  'PSA 22:0-31': 'PSA 22:1-32',
  'PSA 30:0-12': 'PSA 30:1-13',
  'PSA 31:0-24': 'PSA 31:1-25',
  'PSA 34:0-22': 'PSA 34:1-23',
  'PSA 36:0-12': 'PSA 36:1-13',
  'PSA 38:0-22': 'PSA 38:1-23',
  'PSA 39:0-13': 'PSA 39:1-14',
  'PSA 40:0-17': 'PSA 40:1-18',
  'PSA 41:0-13': 'PSA 41:1-14',
  'PSA 42:0-11': 'PSA 42:1-12',
  'PSA 44:0-26': 'PSA 44:1-27',
  'PSA 45:0-17': 'PSA 45:1-18',
  'PSA 46:0-11': 'PSA 46:1-12',
  'PSA 47:0-9': 'PSA 47:1-10',
  'PSA 48:0-14': 'PSA 48:1-15',
  'PSA 49:0-20': 'PSA 49:1-21',
  'PSA 51:0': 'PSA 51:2',
  'PSA 51:1-19': 'PSA 51:3-21',
  'PSA 52:0': 'PSA 52:2',
  'PSA 52:1-9': 'PSA 52:3-11',
  'PSA 53:0-6': 'PSA 53:1-7',
  'PSA 54:0': 'PSA 54:2',
  'PSA 54:1-7': 'PSA 54:3-9',
  'PSA 55:0-23': 'PSA 55:1-24',
  'PSA 56:0-13': 'PSA 56:1-14',
  'PSA 57:0-11': 'PSA 57:1-12',
  'PSA 58:0-11': 'PSA 58:1-12',
  'PSA 59:0-17': 'PSA 59:1-18',
  'PSA 60:0': 'PSA 60:2',
  'PSA 60:1-12': 'PSA 60:3-14',
  'PSA 61:0-8': 'PSA 61:1-9',
  'PSA 62:0-12': 'PSA 62:1-13',
  'PSA 63:0-11': 'PSA 63:1-12',
  'PSA 64:0-10': 'PSA 64:1-11',
  'PSA 65:0-13': 'PSA 65:1-14',
  'PSA 67:0-7': 'PSA 67:1-8',
  'PSA 68:0-35': 'PSA 68:1-36',
  'PSA 69:0-36': 'PSA 69:1-37',
  'PSA 70:0-5': 'PSA 70:1-6',
  'PSA 75:0-10': 'PSA 75:1-11',
  'PSA 76:0-12': 'PSA 76:1-13',
  'PSA 77:0-20': 'PSA 77:1-21',
  'PSA 80:0-19': 'PSA 80:1-20',
  'PSA 81:0-16': 'PSA 81:1-17',
  'PSA 83:0-18': 'PSA 83:1-19',
  'PSA 84:0-12': 'PSA 84:1-13',
  'PSA 85:0-13': 'PSA 85:1-14',
  'PSA 88:0-18': 'PSA 88:1-19',
  'PSA 89:0-52': 'PSA 89:1-53',
  'PSA 92:0-15': 'PSA 92:1-16',
  'PSA 102:0-28': 'PSA 102:1-29',
  'PSA 108:0-13': 'PSA 108:1-14',
  'PSA 140:0-13': 'PSA 140:1-14',
  'PSA 142:0-7': 'PSA 142:1-8',
  'ECC 5:1': 'ECC 4:17',
  'ECC 5:2-20': 'ECC 5:1-19',
  'SNG 6:13': 'SNG 7:1',
  'SNG 7:1-13': 'SNG 7:2-14',
  'ISA 9:1': 'ISA 8:23',
  'ISA 9:2-21': 'ISA 9:1-20',
  'ISA 64:2-12': 'ISA 64:1-11',
  'JER 9:1': 'JER 8:23',
  'JER 9:2-26': 'JER 9:1-25',
  'EZK 20:45-46': 'EZK 21:1-2',
  'EZK 20:47': 'EZK 21:3',
  'EZK 20:48-49': 'EZK 21:4-5',
  'EZK 21:1-32': 'EZK 21:6-37',
  'DAN 4:1-3': 'DAN 3:31-33',
  'DAN 4:4-37': 'DAN 4:1-34',
  'DAN 5:31': 'DAN 6:1',
  'DAN 6:1-28': 'DAN 6:2-29',
  'HOS 1:10-11': 'HOS 2:1-2',
  'HOS 2:1-23': 'HOS 2:3-25',
  'HOS 11:12': 'HOS 12:1',
  'HOS 12:1-14': 'HOS 12:2-15',
  'HOS 13:16': 'HOS 14:1',
  'HOS 14:1-9': 'HOS 14:2-10',
  'JOL 2:28-32': 'JOL 3:1-5',
  'JOL 3:1-21': 'JOL 4:1-21',
  'JON 1:17': 'JON 2:1',
  'JON 2:1-10': 'JON 2:2-11',
  'MIC 5:1': 'MIC 4:14',
  'MIC 5:2-15': 'MIC 5:1-14',
  'NAM 1:15': 'NAM 2:1',
  'NAM 2:1-13': 'NAM 2:2-14',
  'ZEC 1:18-21': 'ZEC 2:1-4',
  'ZEC 2:1-13': 'ZEC 2:5-17',
  'MAL 4:1-6': 'MAL 3:19-24',
})

/** A chapter and a verse. */
export type Place = { chapter: number; verse: number }

const SIDE = /^([1-3A-Z][A-Z]{2}) ([0-9]+):([0-9]+)(?:-([0-9]+))?$/

let inverse: Map<string, Place> | undefined

/**
 * A place of the Hebrew Bible (`GEN 32:2`) to the same place in the UHB's numbering, for every place the table lists, and for
 * verse 1 of a chapter whose title the table maps from verse 0 to verse 2 (it is the title too: UHB verse 0). Built once.
 */
function inverseTable(): Map<string, Place> {
  if (inverse !== undefined) return inverse
  const built = new Map<string, Place>()
  for (const [ours, theirs] of Object.entries(HEBREW_NUMBERING)) {
    const a = SIDE.exec(ours)
    const b = SIDE.exec(theirs)
    if (a === null || b === null) throw new Error(`The Hebrew numbering table has an entry that is not "BOK c:v" or "BOK c:v-w": ${ours} = ${theirs}`)
    const length = Number(a[4] ?? a[3]) - Number(a[3])
    if (length !== Number(b[4] ?? b[3]) - Number(b[3])) throw new Error(`The Hebrew numbering table maps runs of different length: ${ours} = ${theirs}`)
    for (let i = 0; i <= length; i++) {
      const key = `${b[1]} ${Number(b[2])}:${Number(b[3]) + i}`
      if (built.has(key)) throw new Error(`The Hebrew numbering table maps two places of the UHB to ${key}`)
      built.set(key, { chapter: Number(a[2]), verse: Number(a[3]) + i })
    }
    // The title of the UHB is verses 1 and 2 there, and the table lists the second.
    if (Number(a[3]) === 0 && Number(b[3]) === 2) {
      const first = `${b[1]} ${Number(b[2])}:1`
      if (built.has(first)) throw new Error(`The Hebrew numbering table maps a place of the UHB to ${first}, the first line of a title`)
      built.set(first, { chapter: Number(a[2]), verse: 0 })
    }
  }
  inverse = built
  return built
}

/**
 * A place in the Hebrew Bible's numbering, as the UHB numbers it: `PSA 3:1` is `PSA 3:0` (the title is verse 0 in the UHB),
 * `PSA 51:2` is `51:0`, `JON 2:1` is `JON 1:17`. The inverse of the table, well defined because no two places of the UHB map
 * to the same Hebrew place (a test checks it); in the four psalms whose title is verses 1 and 2 there (51, 52, 54 and 60), both
 * are the UHB's verse 0 (`PSA 51:1` is `51:0` too), so the inverse is not one-to-one there. A place the table does not list, and
 * any place outside the Old Testament, comes back unchanged. `book` is a USFM code in any case (`1CH` or `1ch`).
 */
export function fromHebrewNumbering(book: string, place: Place): Place {
  return inverseTable().get(`${book.trim().toUpperCase()} ${place.chapter}:${place.verse}`) ?? { chapter: place.chapter, verse: place.verse }
}
