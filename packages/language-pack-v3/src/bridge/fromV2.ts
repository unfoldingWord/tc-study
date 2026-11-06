/**
 * The bridge from an old pack (`spec/transfer.md`, "Old packs"): a format 1.1 `.langpack.zip` converted on the device into format 3
 * segments and a local catalog. A browser or a Worker can run it: jszip and pako only.
 *
 * Bridging is building from the rows of the pack: {@link bridgeZip} is {@link buildLanguage} over {@link zipSource}, so a book segment
 * made here has the same body, so the same id, as the one the publisher's builder makes from the same rows (test case 13). What differs is the catalog: it
 * is the device's (`origin: local`, `publisher: local:` and the device name, revision 1), unsigned, and it lists what the pack
 * brought plus the `orig` of each book it built. A later published catalog replaces it.
 *
 * Each book is bridged with its `orig` segment (built from the book's rows of `originals`, MACULA included, and the book stamps it gives: the same bytes as the common catalog's when the published orig was built from the same rows and stamps) and the catalog lists it, so the book has all it
 * needs on a device with no network. The catalog does not `require` a common one.
 *
 * The pack's language is the manifest's (`ZipSource.language`). The pack's originals are those of `originals`, which is required:
 * the originals a pack carries itself are not used. A book `originals` lacks is left out with a line in `report`, and waits for them as
 * format 2.0 does.
 *
 * The section registry (`art` sids that last) is the publisher's, kept next to its output, never in a pack: a device builds with an empty
 * one and the registry it ends with is not returned.
 */
import { BUILDER, buildLanguage } from '../build/language'
import type { BuiltSegment } from '../build/catalog'
import type { RowSource } from '../source/rows'
import { zipSource } from '../source/zipSource'

/**
 * Converts the format 1.1 pack `zip`. `originals` is the source of the original languages (UGNT, UHB), `device` the name of the device
 * (it goes in `publisher`), `now` the date and time of the conversion (RFC 3339). Gives the segments, the local catalog and the report
 * of `buildLanguage`.
 *
 * Throws `Error` when `zip` is not a format 1 language pack (`zipSource`), and for rows that are not what a pack writes.
 */
export async function bridgeZip(
  zip: Uint8Array,
  originals: RowSource,
  device: string,
  now: string,
): Promise<{ segments: BuiltSegment[]; catalog: BuiltSegment; report: string[] }> {
  const source = await zipSource(zip, originals)
  const { segments, catalog, report } = await buildLanguage({
    source,
    lang: source.language,
    registry: {},
    partial: true,
    withOrig: true,
    about: { format: '3.0', publisher: `local:${device}`, origin: 'local', revision: 1, built: now, builder: BUILDER },
  })
  return { segments, catalog, report }
}
