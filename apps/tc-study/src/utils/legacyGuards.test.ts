/**
 * Guards against reintroducing deleted legacy modules.
 */
import { describe, expect, test } from 'bun:test'
import { Glob } from 'bun'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC_ROOT = join(import.meta.dir, '..')

const FORBIDDEN_IMPORT_SUBSTRINGS = [
  "from './NotesViewer'",
  'from "./NotesViewer"',
  "from '../NotesViewer'",
  'from "../NotesViewer"',
  "from './QuestionsViewer'",
  'from "./QuestionsViewer"',
  '/_ScriptureViewer.old',
  '/_ScriptureViewer.v2',
  '_ScriptureViewer.tsx.backup',
  "from '../viewers'",
  "from '../../components/viewers'",
  "from './viewers'",
  "pages/Browse",
  "pages/CatalogViewer",
  "pages/Reader",
  "pages/CreatePackage",
  "pages/PassageSets",
  "from './TranslationWordsViewer'",
  'from "./TranslationWordsViewer"',
  "from './TranslationAcademyViewer'",
  'from "./TranslationAcademyViewer"',
  "passage-sets/DefaultPassageSetsModal",
  "passage-sets/PassageSetViewer",
  "passage-sets/HierarchicalPassageSetCreator",
]

const FORBIDDEN_PATHS = [
  'lib/adapters/IndexedDBCatalogAdapter.ts',
  'lib/adapters/LocalStorageCatalogAdapter.ts',
  'components/resources/NotesViewer.tsx',
  'components/resources/QuestionsViewer.tsx',
  'components/resources/_ScriptureViewer.old.tsx',
  'components/resources/_ScriptureViewer.old2.tsx',
  'components/resources/_ScriptureViewer.v2.tsx',
  'components/resources/_ScriptureViewer.tsx.backup',
  'components/resources/TranslationWordsViewer.tsx',
  'components/resources/TranslationAcademyViewer.tsx',
  'components/viewers/index.ts',
  'components/viewers/BibleViewer.tsx',
  'pages/Browse.tsx',
  'pages/CatalogViewer.tsx',
  'pages/Reader.tsx',
  'pages/CreatePackage.tsx',
  'pages/PassageSets.tsx',
  'components/passage-sets/DefaultPassageSetsModal.tsx',
  'components/passage-sets/PassageSetViewer.tsx',
  'components/passage-sets/HierarchicalPassageSetCreator.tsx',
]

async function collectSourceFiles(): Promise<string[]> {
  const glob = new Glob('**/*.{ts,tsx}')
  const files: string[] = []
  for await (const path of glob.scan({ cwd: SRC_ROOT, absolute: true })) {
    if (path.includes('legacyGuards.test.ts')) continue
    if (path.includes('.test.ts') || path.includes('.test.tsx')) continue
    if (path.includes('node_modules')) continue
    files.push(path)
  }
  return files
}

describe('legacyGuards', () => {
  test('deleted legacy files are gone', async () => {
    const { existsSync } = await import('node:fs')
    for (const rel of FORBIDDEN_PATHS) {
      expect(existsSync(join(SRC_ROOT, rel))).toBe(false)
    }
  })

  test('source does not import deleted legacy modules', async () => {
    const files = await collectSourceFiles()
    const offenders: string[] = []
    for (const file of files) {
      const content = readFileSync(file, 'utf8')
      for (const needle of FORBIDDEN_IMPORT_SUBSTRINGS) {
        if (content.includes(needle)) {
          offenders.push(`${file} contains ${needle}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
