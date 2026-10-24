import { describe, expect, test } from 'bun:test'
import JSZip from 'jszip'
import { generateTWIngredients, twIngredientsFromZip } from '../src/ingredients-generator'

async function zipOf(files: Record<string, string>): Promise<ArrayBuffer> {
  const zip = new JSZip()
  for (const [path, body] of Object.entries(files)) zip.file(`es-419_tw/${path}`, body)
  return zip.generateAsync({ type: 'arraybuffer' })
}

describe('twIngredientsFromZip', () => {
  test('gives from a zip in hand what the zipball method gives from a download', async () => {
    const zip = await zipOf({ 'bible/kt/god.md': '# Dios\n\nEl creador.\n', 'bible/names/naomi.md': '# Noemí\n', 'bible/other/day.md': 'sin título\n', 'LICENSE.md': 'x' })
    const client = { downloadZipball: async () => zip } as never
    const downloaded = await generateTWIngredients({ owner: 'o', language: 'es-419', resourceId: 'tw', ref: 'v1', door43Client: client })
    const inHand = await twIngredientsFromZip(zip)
    expect(inHand.ingredients).toEqual(downloaded.ingredients)
    expect(inHand.ingredients.map((i) => [i.identifier, i.title])).toEqual([
      ['bible/kt/god', 'Dios'],
      ['bible/names/naomi', 'Noemí'],
      ['bible/other/day', 'day'],
    ])
  })
})
