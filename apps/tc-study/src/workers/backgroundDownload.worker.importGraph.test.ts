/**
 * Static audit: backgroundDownload.worker first-party graph must not pull
 * React / HMR / module-scope `window` (those crash the isolate and used to
 * dump JSZip+USJ onto the UI thread).
 */
import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const WORKER = fileURLToPath(new URL('./backgroundDownload.worker.ts', import.meta.url))
const TC_STUDY_SRC = join(dirname(WORKER), '..')
const REPO_ROOT = join(TC_STUDY_SRC, '../../..')
const PACKAGES = join(REPO_ROOT, 'packages')

const IMPORT_RE =
  /(?:^|\n)\s*(?:import|export)\s+(type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function moduleScopeHasDomGlobal(src: string): boolean {
  const body = stripComments(src)
  let depth = 0
  let i = 0
  while (i < body.length) {
    const ch = body[i]
    if (ch === "'" || ch === '"' || ch === '`') {
      const q = ch
      i++
      while (i < body.length && body[i] !== q) {
        if (body[i] === '\\') i++
        i++
      }
      i++
      continue
    }
    if (ch === '{') {
      depth++
      i++
      continue
    }
    if (ch === '}') {
      depth = Math.max(0, depth - 1)
      i++
      continue
    }
    if (depth === 0 && /\b(?:window|document)\b/.test(body.slice(i, i + 12))) {
      const slice = body.slice(Math.max(0, i - 2), i + 12)
      if (/\b(?:window|document)\b/.test(slice)) return true
    }
    i++
  }
  return false
}

function importsReact(src: string): boolean {
  const body = stripComments(src)
  return (
    /(?:^|\n)\s*import\s+(?!type\s)[\s\S]*?from\s+['"]react(?:-dom)?(?:\/[^'"]*)?['"]/.test(
      body
    ) || /@react-refresh/.test(body)
  )
}

function resolveWorkspace(spec: string, fromFile: string): string | null {
  if (spec.startsWith('.')) {
    const base = join(dirname(fromFile), spec)
    for (const ext of ['.ts', '.tsx', '.js', '/index.ts', '/index.js', '']) {
      const p = normalize(base + ext)
      if (existsSync(p) && statSync(p).isFile()) return p
    }
    return null
  }
  if (!spec.startsWith('@bt-synergy/')) return null
  const rest = spec.slice('@bt-synergy/'.length)
  const slash = rest.indexOf('/')
  const name = slash === -1 ? rest : rest.slice(0, slash)
  const sub = slash === -1 ? '' : rest.slice(slash + 1)
  const pkgRoot = join(PACKAGES, name)
  if (!existsSync(pkgRoot)) return null
  if (sub === 'core') {
    const core = join(pkgRoot, 'src/core.ts')
    if (existsSync(core)) return core
  }
  const srcIndex = join(pkgRoot, 'src/index.ts')
  if (existsSync(srcIndex) && !sub) return srcIndex
  const pkgJsonPath = join(pkgRoot, 'package.json')
  if (!existsSync(pkgJsonPath)) return null
  try {
    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as { main?: string }
    if (pkg.main) {
      const main = join(pkgRoot, pkg.main)
      if (existsSync(main)) return main
    }
  } catch {
    /* ignore */
  }
  return null
}

function collectFirstPartyGraph(entry: string): { files: string[]; parent: Map<string, string> } {
  const seen = new Set<string>()
  const parent = new Map<string, string>()
  const queue = [normalize(entry)]
  while (queue.length > 0) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    if (!existsSync(file) || !statSync(file).isFile() || !/\.(ts|tsx|js)$/.test(file)) continue
    const src = stripComments(readFileSync(file, 'utf8'))
    IMPORT_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = IMPORT_RE.exec(src))) {
      const isTypeOnly = Boolean(m[1])
      if (isTypeOnly) continue
      const resolved = resolveWorkspace(m[2], file)
      if (
        resolved &&
        !seen.has(resolved) &&
        !/\.(test|spec)\.(ts|tsx|js)$/.test(resolved)
      ) {
        parent.set(resolved, `${file} -> ${m[2]}`)
        queue.push(resolved)
      }
    }
  }
  return { files: [...seen], parent }
}

describe('backgroundDownload.worker import graph', () => {
  test('vite worker plugins do not include React / HMR', () => {
    const viteJs = readFileSync(join(TC_STUDY_SRC, '../vite.config.js'), 'utf8')
    const workerBlock = viteJs.slice(viteJs.indexOf('worker:'))
    expect(workerBlock).toContain('forceDecodeNamedCharRefNode')
    expect(workerBlock).not.toMatch(/react\(\)/)
    expect(workerBlock).not.toContain('@vitejs/plugin-react')
  })

  test('first-party graph has no React and no module-scope window/document', () => {
    const { files, parent } = collectFirstPartyGraph(WORKER)
    expect(files.length).toBeGreaterThan(8)
    const leaks: string[] = []
    for (const file of files) {
      if (!existsSync(file) || !statSync(file).isFile()) continue
      const src = readFileSync(file, 'utf8')
      const rel = file.replace(REPO_ROOT + '\\', '').replace(REPO_ROOT + '/', '')
      if (importsReact(src)) {
        leaks.push(`${rel}: imports react via ${parent.get(file) ?? 'entry'}`)
      }
      if (moduleScopeHasDomGlobal(src)) {
        leaks.push(`${rel}: module-scope window/document via ${parent.get(file) ?? 'entry'}`)
      }
    }
    expect(leaks).toEqual([])
  })

  test('worker entry does not import resource type viewers', () => {
    const src = readFileSync(WORKER, 'utf8')
    expect(src).toContain('registerWorkerLoaders')
    expect(src).toContain('@bt-synergy/catalog-manager/core')
    expect(src).not.toContain('../resourceTypes')
    expect(src).not.toContain("from 'react'")
    expect(moduleScopeHasDomGlobal(src)).toBe(false)
  })
})
