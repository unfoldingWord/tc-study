/**
 * The reader of the OBS Theological Formation manual (en_obs-tf) for the Five Movements tables of the obs segment
 * (`spec/cddl/obs.cddl`, "OBS Five Movements"; the checks are in `spec/obs-5m-checks.md`).
 *
 * {@link parseObsTf} reads the per-story Markdown files and the transclusions from a map of file contents and gives an
 * {@link ObsTfModel} with the build's errors and warnings. It reads nothing from disk and no network; the same files give the
 * same model. The frames, titles and images are never taken from the manual: they are the `obs` stories', and the manual's
 * frame text is kept only for a frame the `obs` stories lack (`ObsTfModel.frames`).
 *
 * The files: `obs_story_{N}.md` (N from 1 to 50), `transclusions/{name}.md`, and optionally `transclusions/overview.md`.
 */
import type { ObsStory, ObsTfBlock, ObsTfModel, ObsTfQuestion, ObsTfShared, ObsTfTerm } from '../model'

import { TF_LISTS, TF_PARTS } from '../obsTfCodes'

export { TF_LISTS, TF_PARTS }

/** What each shared transclusion is a part of. */
const SHARED_PART: Record<string, string> = {
  movement_2_drafting: 'drafting',
  movement_3_checking: 'checking',
  movement_4: 'm4',
  movement_5: 'm5',
  conclusion: 'conclusion',
}

/** The reviewed correspondence (`obs-5m-checks.md`): the frame labels of the story text that name several OBS frames or another one. */
const CORRESPONDENCE: Record<number, Record<string, number[]>> = { 21: { '21-13': [2113, 2114], '21-14': [2115] } }
/** The reviewed typos of a reference (story 44, discourse question 2). */
const LABEL_FIXES: Record<number, Record<string, string>> = { 44: { '43-03': '44-03' } }

export type ObsTfResult = { model: ObsTfModel; errors: string[]; warnings: string[] }

const pad = (n: number): string => String(n).padStart(2, '0')
const frameIdOf = (label: string): number | null => {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(label)
  return m ? Number(m[1]) * 100 + Number(m[2]) : null
}
const labelOf = (id: number): string => `${pad(Math.floor(id / 100))}-${pad(id % 100)}`
const stripComments = (s: string): string => s.replace(/<!--[\s\S]*?-->/g, '')
const paras = (s: string): string[] => s.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p !== '')
const unix = (s: string): string => s.replace(/\r\n/g, '\n')
const normText = (s: string): string => s.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/-{2,3}|[—–]/g, '-').replace(/\s+/g, ' ').trim()

type Sec = { level: number; head: string; body: string }
/** The sections of a Markdown text by heading line (`#` to `#########`), in order; the first has level 0 and no heading. */
function sections(md: string): Sec[] {
  const out: Sec[] = []
  let cur: Sec = { level: 0, head: '', body: '' }
  for (const line of md.split('\n')) {
    const m = /^(#{1,9})\s+(.*?)\s*$/.exec(line)
    if (m) {
      out.push(cur)
      cur = { level: m[1].length, head: m[2], body: '' }
    } else cur.body += line + '\n'
  }
  out.push(cur)
  return out
}

/** The parts of the 5M session, by the second-level heading that opens them. */
const PART_OF_HEADING: [string, string][] = [['Biblical Interpretation', 'm1'], ['Theological Dialogue', 'm2'], ['Personal Reflection', 'm3']]

export function parseObsTf(files: ReadonlyMap<string, string>, res: string, obs: readonly ObsStory[]): ObsTfResult {
  const errors: string[] = []
  const warnings: string[] = []
  const read = (name: string): string | undefined => {
    const text = files.get(name)
    return text === undefined ? undefined : unix(text)
  }
  const obsByStory = new Map(obs.map((s) => [s.n, s]))

  // Shared blocks, by key, with their first use order decided later.
  const sharedByKey = new Map<string, ObsTfShared>()
  const sharedBlock = (key: string, where: string): boolean => {
    if (sharedByKey.has(key)) return true
    const [file, anchor] = key.split('#')
    if (anchor === '' || key.split('#').length > 2) {
      errors.push(`${where}: transclusion ${key}: the anchor is not one heading`)
      return false
    }
    const raw = read(`transclusions/${file}.md`)
    if (raw === undefined) {
      errors.push(`${where}: transclusion ${key}: the file does not exist`)
      return false
    }
    let md = stripComments(raw.replace(/^---\n[\s\S]*?\n---\n/, ''))
    let resolved = key
    if (anchor !== undefined) {
      const secs = sections(md)
      let i = secs.findIndex((s) => s.head === anchor)
      if (i < 0) {
        const ws = (x: string): string => x.replace(/\s+/g, ' ')
        i = secs.findIndex((s) => ws(s.head) === ws(anchor))
        if (i >= 0) warnings.push(`${where}: transclusion ${key}: the heading matched only with spaces collapsed («${secs[i].head}»)`)
      }
      if (i < 0) {
        errors.push(`${where}: transclusion ${key}: the heading does not exist`)
        return false
      }
      resolved = `${file}#${secs[i].head}`
      const level = secs[i].level
      let j = i + 1
      while (j < secs.length && secs[j].level > level) j++
      md = secs.slice(i, j).map((s) => `${'#'.repeat(s.level)} ${s.head}\n${s.body}`).join('')
    }
    const first = /^\s*(#{1,9})\s+(.*?)\s*\n([\s\S]*)$/.exec(md)
    const title = first === null ? '' : first[2]
    const text = (first === null ? md : first[3]).trim()
    if (title === '') errors.push(`${where}: transclusion ${key}: the block has no heading`)
    const block: ObsTfShared = { key: resolved, title }
    if (text !== '') block.text = text
    sharedByKey.set(key, block)
    return true
  }

  const parts: ObsTfBlock[] = []
  const questions: ObsTfQuestion[] = []
  const terms: ObsTfTerm[] = []
  const frames: { frame: number; text: string }[] = []
  const coverage: number[] = []

  for (let n = 1; n <= 50; n++) {
    const file = `obs_story_${n}.md`
    const raw = read(file)
    if (raw === undefined) continue
    const where = `story ${n}`
    const md = stripComments(raw.replace(/^---\n[\s\S]*?\n---\n/, ''))
    const secs = sections(md)
    const st = obsByStory.get(n)
    const blocks: ObsTfBlock[] = []
    const tfFrames: { label: string; text: string }[] = []
    const kOf: Record<string, number> = {}
    const nextK = (part: string): number => (kOf[part] = (kOf[part] ?? 0) + 1)
    const fixes = LABEL_FIXES[n] ?? {}
    let title = ''
    let ref = ''

    const mapFrames = (label: string): { ids: number[]; corrected: boolean } => {
      let norm = label.replace(/^(\d+)-(\d+)$/, (_, a: string, b: string) => `${pad(Number(a))}-${pad(Number(b))}`)
      if (fixes[norm] !== undefined) norm = fixes[norm]
      const id = frameIdOf(norm)
      if (id === null) {
        errors.push(`${where}: the frame label ${JSON.stringify(label)} cannot be read`)
        return { ids: [], corrected: false }
      }
      return { ids: [id], corrected: norm !== label }
    }
    const takeTransclusions = (body: string): void => {
      for (const m of body.matchAll(/!\[\[([^\]]+)\]\]/g)) {
        const key = m[1]
        if (/\.(jpe?g|png)$/i.test(key)) continue
        let part: string | undefined
        if (key.startsWith('obs-devotionals-unit-')) part = 'community'
        else if (SHARED_PART[key] !== undefined) part = SHARED_PART[key]
        if (part === undefined) {
          errors.push(`${where}: unknown transclusion ${key}`)
          continue
        }
        if (sharedBlock(key, where)) blocks.push({ story: n, part, shared: key })
      }
    }
    const lead = (body: string): string | undefined => {
      const text = paras(body.replace(/!\[\[[^\]]+\]\]/g, '')).join('\n\n')
      return text === '' ? undefined : text
    }
    const numbered = (body: string): { leadText: string; items: string[] } => {
      const [leadText, ...rest] = ('\n' + body).split(/\n(?=\d+\.\s)/)
      const items = rest.join('\n').split(/\n(?=\d+\.\s)/)
      return { leadText, items }
    }
    const listItems = (items: string[]): string[] =>
      items.map((it) => it.replace(/!\[\[[^\]]+\]\][\s\S]*$/, '').replace(/^\d+\.\s+/, '').trim()).filter((q) => q !== '')

    let mode = ''
    const intro: string[] = []
    for (const s of secs) {
      const h = s.head
      if (s.level === 2 && h === 'Introduction') {
        mode = 'intro'
        if (s.body.trim() !== '') intro.push(s.body.trim())
        continue
      }
      if (mode === 'intro' && s.level === 3 && !h.startsWith('Open Bible Story:')) { intro.push(`### ${h}\n${s.body.trim()}`); continue }
      if (s.level === 3 && h.startsWith('Open Bible Story:')) {
        const text = intro.join('\n\n')
        blocks.push(text === '' ? { story: n, part: 'intro', title: 'Introduction' } : { story: n, part: 'intro', title: 'Introduction', text })
        blocks.push({ story: n, part: 'frames' })
        title = h.replace('Open Bible Story:', '').trim()
        mode = 'frames'
        continue
      }
      if (mode === 'frames' && s.level === 9) {
        const refMatch = /\*A Bible story from: (.+?)\*/.exec(s.body)
        if (refMatch !== null) ref = refMatch[1].trim()
        const body = s.body.replace(/\*A Bible story from: (.+?)\*/, '')
        tfFrames.push({ label: h, text: paras(body.replace(/!\[\[[^\]]*\]\]/g, '\n\n')).join('\n\n') })
        takeTransclusions(body)
        continue
      }
      if (s.level === 2) {
        const code = PART_OF_HEADING.find(([prefix]) => h.startsWith(prefix))?.[1]
        if (code === undefined) {
          errors.push(`${where}: the part heading ${JSON.stringify(h)} is not known`)
          continue
        }
        mode = code
        const text = lead(s.body)
        blocks.push({ story: n, part: code, title: h, ...(text === undefined ? {} : { text }) })
        takeTransclusions(s.body)
        continue
      }
      const listHead = (part: string, list: string, m: string): void => {
        mode = m
        const text = lead(s.body)
        blocks.push({ story: n, part, list, title: h, ...(text === undefined ? {} : { text }) })
      }
      if (s.level === 3 && h === 'Observation Questions') { listHead('m1', 'observation', 'm1:observation'); takeTransclusions(s.body); continue }
      if (s.level === 3 && h === 'Translation Questions') { listHead('m1', 'terms', 'm1:terms'); continue }
      if (s.level === 3 && h === 'Discourse Questions') { listHead('m2', 'discourse', 'm2:discourse'); continue }
      if (s.level === 3 && (h === 'Theological Questions' || h === 'Journal Reflection')) {
        const [part, list] = h === 'Theological Questions' ? ['m2', 'theology'] : ['m3', 'journal']
        const { leadText, items } = numbered(s.body)
        mode = `${part}:${list}`
        const text = lead(leadText)
        blocks.push({ story: n, part, list, title: h, ...(text === undefined ? {} : { text }) })
        for (const q of listItems(items)) questions.push({ story: n, part, list, k: nextK(part), frames: [], q })
        takeTransclusions(s.body)
        continue
      }
      if (s.level === 4 && mode === 'm1:observation') {
        const { ids, corrected } = mapFrames(h)
        for (const p of paras(s.body)) {
          const [q, ...a] = p.split(/ {2}\n|\n/)
          const answer = a.join('\n').trim()
          questions.push({ story: n, part: 'm1', list: 'observation', k: nextK('m1'), frames: ids, q: q.trim(), ...(answer === '' ? {} : { a: answer }), ...(corrected ? { refText: h } : {}) })
        }
        continue
      }
      if (s.level === 4 && mode === 'm1:terms') {
        const { ids, corrected } = mapFrames(h)
        for (const p of paras(s.body)) {
          const term = /^\*\*(.+?)\*\*/.exec(p)?.[1]
          if (term === undefined) warnings.push(`${where} ${h}: a translation paragraph without a bold term`)
          const frame = ids[0]
          if (frame === undefined) continue
          const k = terms.filter((t) => t.frame === frame).length + 1
          terms.push({ frame, k, text: p, ...(term === undefined ? {} : { term }), ...(corrected ? { refText: h } : {}) })
        }
        continue
      }
      if (s.level === 5 && mode === 'm2:discourse') {
        const m = /^(.*?)\s*\(([\d\-,\s]+)\)\s*$/.exec(h)
        const q = m ? m[1] : h
        const mapped = m ? m[2].split(/[,\s]+/).filter((x) => x !== '').map((l) => mapFrames(l)) : []
        const ids = [...new Set(mapped.flatMap((x) => x.ids))]
        const answer = paras(s.body).join('\n\n')
        questions.push({ story: n, part: 'm2', list: 'discourse', k: nextK('m2'), frames: ids, q, ...(answer === '' ? {} : { a: answer }), ...(m && mapped.some((x) => x.corrected) ? { refText: m[2].trim() } : {}) })
        continue
      }
      if (s.level >= 1 && mode !== '') takeTransclusions(s.body)
    }

    // The frames of the story against the obs story's (checks 1, 2, 5, 6).
    const corr = CORRESPONDENCE[n]
    const labelIds = (label: string): number[] => corr?.[label] ?? [frameIdOf(label) ?? -1]
    let storyInTf = false
    if (st === undefined) {
      // The approved fallback: the language's obs has no such story; the manual's frames stand in.
      storyInTf = true
      for (const f of tfFrames) {
        if (f.text === '') errors.push(`${where}: frame ${f.label} of the manual has no text`)
        else for (const id of labelIds(f.label)) frames.push({ frame: id, text: f.text })
      }
      const fr = blocks.find((b) => b.part === 'frames')
      if (fr !== undefined && title !== '') fr.title = title
    } else {
      const obsIds = st.frames.map((f) => n * 100 + f.n)
      const mapped = tfFrames.flatMap((f) => labelIds(f.label))
      const obsSet = new Set(obsIds)
      const missingInObs = mapped.filter((id) => !obsSet.has(id))
      const missingInTf = obsIds.filter((id) => !mapped.includes(id))
      if (missingInObs.length > 0 && missingInTf.length === 0) {
        errors.push(`${where}: the frames ${missingInObs.map(labelOf).join(', ')} of the manual are not in obs and obs has no other`)
      } else if (missingInObs.length > 0 || mapped.length !== obsIds.length || mapped.some((id, i) => id !== obsIds[i])) {
        errors.push(`${where}: the frames differ (manual ${tfFrames.length}, obs ${obsIds.length}) and no correspondence covers it`)
      }
      for (const f of tfFrames) {
        const a = normText(f.text)
        const b = normText(labelIds(f.label).map((id) => st.frames.find((x) => n * 100 + x.n === id)?.text ?? '').join(' '))
        if (a !== b) {
          let k = 0
          while (k < a.length && a[k] === b[k]) k++
          warnings.push(`${where}: frame ${f.label}: text differs from obs (manual «${a.slice(Math.max(0, k - 20), k + 40)}» obs «${b.slice(Math.max(0, k - 20), k + 40)}»)`)
        }
      }
      if (normText(title) !== normText(st.title)) warnings.push(`${where}: title differs (manual «${title}» obs «${st.title}»)`)
      const obsRef = (st.reference ?? '').replace(/^[^:]*:\s*/, '')
      if (ref !== '' && normText(ref) !== normText(obsRef)) warnings.push(`${where}: reference differs (manual «${ref}» obs «${obsRef}»)`)
    }
    const frameOk = (id: number): boolean =>
      Math.floor(id / 100) === n && (storyInTf ? frames.some((f) => f.frame === id) : st!.frames.some((x) => n * 100 + x.n === id))
    for (const q of questions.filter((x) => x.story === n)) for (const id of q.frames) if (!frameOk(id)) errors.push(`${where}: question ${n}/${q.part}/${q.k} names the frame ${labelOf(id)}, which is not in obs`)
    for (const t of terms.filter((x) => Math.floor(x.frame / 100) === n)) {
      if (!frameOk(t.frame)) errors.push(`${where}: the term ${n}:${t.frame % 100}/${t.k} names a frame that is not in obs`)
    }
    const plain = (x: string): string => normText(x).toLowerCase().replace(/[^\p{L}\p{N}' ]/gu, ' ').replace(/\s+/g, ' ').trim()
    for (const t of terms.filter((x) => Math.floor(x.frame / 100) === n && x.term !== undefined && !storyInTf)) {
      const text = st!.frames.find((x) => n * 100 + x.n === t.frame)?.text
      if (text !== undefined && !plain(text).includes(plain(t.term!))) warnings.push(`${where}: the term ${n}:${t.frame % 100}/${t.k} «${t.term}» is not in its frame`)
    }
    const present = new Set(blocks.map((b) => b.part))
    for (const p of TF_PARTS) if (!present.has(p)) warnings.push(`${where}: no part ${p}`)
    const listsOf: Record<string, string[]> = { m1: ['observation', 'terms'], m2: ['discourse', 'theology'], m3: ['journal'] }
    for (const [p, ls] of Object.entries(listsOf)) {
      if (present.has(p)) for (const l of ls) if (!blocks.some((b) => b.part === p && b.list === l)) warnings.push(`${where}: part ${p} has no list ${l}`)
    }
    const tokens = [...md.matchAll(/!\[\[([^\]]+)\]\]/g)].filter((m) => !/\.(jpe?g|png)$/i.test(m[1])).length
    const rows = blocks.filter((b) => b.shared !== undefined).length
    if (tokens !== rows) errors.push(`${where}: ${tokens} transclusions in the text and ${rows} shared rows: one was not read`)
    coverage.push(n)
    parts.push(...blocks)
  }

  // Row order of tf-parts: the stories ascending, the parts in the fixed order, a part's heading row then its lists in order;
  // the rows of one part and list keep the order of the source (a stable sort).
  const rank = (b: ObsTfBlock): number => TF_PARTS.indexOf(b.part as (typeof TF_PARTS)[number]) * 10 + (b.list === undefined ? 0 : 1 + TF_LISTS.indexOf(b.list as (typeof TF_LISTS)[number]))
  const sorted = parts.map((b, i) => ({ b, i })).sort((x, y) => x.b.story - y.b.story || rank(x.b) - rank(y.b) || x.i - y.i).map((x) => x.b)

  // tf-shared: in the order of first use through the sorted rows; the rows name the block by its resolved key.
  const shared: ObsTfShared[] = []
  const used = new Map<string, number>()
  for (const b of sorted) {
    if (b.shared === undefined) continue
    const block = sharedByKey.get(b.shared)
    if (block === undefined) continue
    if (!used.has(block.key)) {
      used.set(block.key, shared.length)
      shared.push(block)
    }
    b.shared = block.key
  }

  // Questions and terms in table order.
  const partNo = (p: string): number => TF_PARTS.indexOf(p as (typeof TF_PARTS)[number])
  questions.sort((a, b) => a.story - b.story || partNo(a.part) - partNo(b.part) || a.k - b.k)
  terms.sort((a, b) => a.frame - b.frame || a.k - b.k)
  frames.sort((a, b) => a.frame - b.frame)

  // The framework: names from the headings of the movements, and the framing text of the method.
  const names: Record<string, string> = {}
  for (const b of sorted) {
    if (/^m[1-5]$/.test(b.part) && b.list === undefined && names[b.part] === undefined) {
      const name = b.title ?? (b.shared === undefined ? undefined : shared[used.get(b.shared)!]?.title)
      if (name !== undefined && name !== '') names[b.part] = name
    }
  }
  const framework: ObsTfModel['framework'] = ['m1', 'm2', 'm3', 'm4', 'm5'].map((code) => (names[code] === undefined ? { code } : { code, name: names[code] }))
  const overview = read('transclusions/overview.md')
  if (overview !== undefined) {
    const text = stripComments(overview.replace(/^---\n[\s\S]*?\n---\n/, '')).replace(/^\s*# .*\n/, '').trim()
    if (text !== '') framework.push({ code: 'overview', text })
  }

  const model: ObsTfModel = { res, stories: coverage, parts: sorted, questions, terms, shared, frames, framework }
  return { model, errors, warnings }
}
