import { expect, test } from 'bun:test'
import { fetchEnTaTitles } from './fetch-en-ta-titles'

const files: Record<string, string> = {
  'translate/figs-activepassive': 'Active or Passive\n',
  'translate/Figs-Order': 'Word Order',
  'translate/figs-orderheb': 'Word Order',
  'checking/acceptable': 'Acceptable Style',
}

// A fake Door43: a tree in two pages and the title.md files.
const fake = (async (input: RequestInfo | URL) => {
  const url = String(input)
  if (url.includes('/git/trees/v91')) {
    const page = Number(new URL(url).searchParams.get('page'))
    const paths = Object.keys(files).map((p) => `${p}/title.md`)
    const tree = (page === 1 ? paths.slice(0, 2) : paths.slice(2)).map((path) => ({ path, type: 'blob' }))
    tree.push({ path: 'README.md', type: 'blob' }, { path: 'translate', type: 'tree' })
    return Response.json({ tree, truncated: page === 1, page, total_count: paths.length })
  }
  const path = decodeURIComponent(url.split('/raw/tag/v91/')[1]).replace(/\/title\.md$/, '')
  return path in files ? new Response(files[path]) : new Response('no', { status: 404 })
}) as typeof fetch

test('reads the title.md of every article of the tag, lower-cases the slug and lists shared titles', async () => {
  const out = await fetchEnTaTitles('v91', fake, 'https://door43.test')
  expect(out.tag).toBe('v91')
  expect(out.titles).toEqual({
    'Acceptable Style': 'ta:checking/acceptable',
    'Active or Passive': 'ta:translate/figs-activepassive',
  })
  expect(out.ambiguous).toEqual({ 'Word Order': ['ta:translate/figs-order', 'ta:translate/figs-orderheb'] })
})
