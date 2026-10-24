import { describe, expect, test } from 'bun:test'
import JSZip from 'jszip'
import { generateTAIngredients, taIngredientsFromZip } from '../src/ingredients-generator'

async function zipOf(files: Record<string, string>): Promise<ArrayBuffer> {
  const zip = new JSZip()
  for (const [path, body] of Object.entries(files)) zip.file(`es-419_ta/${path}`, body)
  return zip.generateAsync({ type: 'arraybuffer' })
}

describe('taIngredientsFromZip', () => {
  test('gives from a zip in hand what the zipball method gives from a download', async () => {
    const zip = await zipOf({
      'translate/figs-idiom/title.md': 'Modismos\n',
      'translate/figs-idiom/01.md': 'Así.\n',
      'checking/acceptable/01.md': 'Bien.\n',
      // No 01.md: not an article.
      'process/intro/title.md': 'Intro\n',
      'translate/toc.yaml': 'title: Traducir\n',
    })
    const client = { downloadZipball: async () => zip } as never
    const downloaded = await generateTAIngredients({ owner: 'o', language: 'es-419', resourceId: 'ta', ref: 'v1', door43Client: client })
    const inHand = await taIngredientsFromZip(zip)
    expect(inHand.ingredients).toEqual(downloaded.ingredients)
    expect(inHand.ingredients.map((i) => [i.identifier, i.title])).toEqual([
      ['checking/acceptable', 'acceptable'],
      ['translate/figs-idiom', 'Modismos'],
    ])
  })
})
