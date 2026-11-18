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

/**
 * The headings a manual of one language uses (`spec/obs-5m-checks.md`, "Reading the source"). A heading matches a text when it starts
 * with it, ignoring case, hyphens, accents and the white space around them. `blocks` are first-level headings whose section is a block of the
 * story itself (the manual of a language that does not transclude them): the heading starts with the text, and its section runs to the next
 * heading of the first or second level; the block is stored once, under the key `obs_story_N.md#{heading}`.
 */
export type ObsTfHeadings = {
  intro: string[]
  story: string[]
  parts: { m1: string[]; m2: string[]; m3: string[] }
  lists: { observation: string[]; terms: string[]; discourse: string[]; theology: string[]; journal: string[] }
  blocks: Record<string, string>
}

export const OBS_TF_HEADINGS: Record<string, ObsTfHeadings> = {
  en: {
    intro: ['Introduction'],
    story: ['Open Bible Story:'],
    parts: { m1: ['Biblical Interpretation'], m2: ['Theological Dialogue'], m3: ['Personal Reflection'] },
    lists: { observation: ['Observation Questions'], terms: ['Translation Questions'], discourse: ['Discourse Questions'], theology: ['Theological Questions'], journal: ['Journal Reflection'] },
    blocks: {},
  },
  id: {
    intro: ['Pengantar'],
    story: ['Cerita Alkitab'],
    parts: { m1: ['Penafsiran Alkitab', 'Interpretasi Alkitab'], m2: ['Dialog Teologis', 'Percakapan Teologis'], m3: ['Refleksi Pribadi'] },
    lists: {
      observation: ['Pertanyaan-Pertanyaan Observasi'],
      terms: ['Pertanyaan-Pertanyaan Penerjemahan', 'Pertanyaan-Pertanyaan Terjemahan'],
      discourse: ['Pertanyaan-Pertanyaan Diskursus', 'Pertanyaan-Pertanyaan Diskurus'],
      theology: ['Pertanyaan-Pertanyaan Teologis'],
      journal: ['Refleksi Jurnal'],
    },
    blocks: {
      'Studi Komunitas': 'community',
      'Naskah Awal Terjemahan': 'drafting',
      'Pemeriksaan Tim': 'checking',
      'Praktik Pelayanan': 'm4',
      'Penjangkauan Misi': 'm5',
      Kesimpulan: 'conclusion',
    },
  },
}

const fold = (x: string): string =>
  x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[-\u2010-\u2015]+/g, ' ').replace(/\s+/g, ' ').trim()
const startsWithAny = (h: string, texts: readonly string[]): boolean => texts.some((t) => fold(h).startsWith(fold(t)))

/**
 * `lang` picks the headings ({@link OBS_TF_HEADINGS}); the reviewed corrections of frame labels (`CORRESPONDENCE`, `LABEL_FIXES`) are of the English manual.
 */
export function parseObsTf(files: ReadonlyMap<string, string>, res: string, obs: readonly ObsStory[], lang = 'en'): ObsTfResult {
  const H = OBS_TF_HEADINGS[lang]
  if (H === undefined) return { model: { res, stories: [], parts: [], questions: [], terms: [], shared: [], frames: [], framework: [] }, errors: [`no headings are known for the language ${lang}`], warnings: [] }
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
    const fixes = lang === 'en' ? LABEL_FIXES[n] ?? {} : {}
    let title = ''
    let ref = ''
    let introTitle = 'Introduction'
    let tokenRows = 0

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
        if (sharedBlock(key, where)) {
          blocks.push({ story: n, part, shared: key })
          tokenRows++
        }
      }
    }
    const withoutTransclusions = (body: string): string => body.replace(/!\[\[[^\]]+\]\]/g, '')
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
    // A block of the story itself (`H.blocks`): its heading (first level, or third when the conversion levelled it so), and the sections below it up to the next heading of its level or above (never below the second).
    let open: { part: string; head: string; text: string; level: number } | undefined
    const closeBlock = (): void => {
      if (open === undefined) return
      const key = `${file}#${open.head}`
      if (sharedByKey.has(key)) errors.push(`${where}: the block ${JSON.stringify(open.head)} is in the story twice`)
      else {
        const block: ObsTfShared = { key, title: open.head }
        const text = open.text.trim()
        if (text !== '') block.text = text
        sharedByKey.set(key, block)
        blocks.push({ story: n, part: open.part, shared: key })
      }
      open = undefined
    }
    for (const s of secs) {
      const h = s.head
      // A heading of the second level that no part uses, right after a block's heading and before any of its text, is the rest of a title that the conversion split in two.
      const knownSecond = startsWithAny(h, H.intro) || (['m1', 'm2', 'm3'] as const).some((c) => startsWithAny(h, H.parts[c]))
      if (open !== undefined && open.level === 1 && s.level === 2 && !knownSecond && open.text.trim() === '') {
        takeTransclusions(s.body)
        open.text += `## ${h}\n${withoutTransclusions(s.body)}`
        continue
      }
      const namesBlock = Object.keys(H.blocks).some((text) => startsWithAny(h, [text]))
      if (open !== undefined && (s.level <= Math.max(open.level, 2) || (s.level === 3 && namesBlock))) closeBlock()
      if (open !== undefined) {
        takeTransclusions(s.body)
        open.text += `${'#'.repeat(s.level)} ${h}\n${withoutTransclusions(s.body)}`
        continue
      }
      if ((s.level === 1 || s.level === 3) && Object.keys(H.blocks).length > 0) {
        const part = Object.entries(H.blocks).find(([text]) => startsWithAny(h, [text]))?.[1]
        if (part === undefined && s.level === 1) {
          errors.push(`${where}: the first-level heading ${JSON.stringify(h)} is not known`)
          continue
        }
        if (part !== undefined) {
          mode = 'block'
          takeTransclusions(s.body)
          open = { part, head: h, text: withoutTransclusions(s.body), level: s.level }
          continue
        }
      }
      if (s.level === 2 && startsWithAny(h, H.intro)) {
        mode = 'intro'
        introTitle = h
        if (s.body.trim() !== '') intro.push(s.body.trim())
        continue
      }
      if (mode === 'intro' && s.level === 3 && !startsWithAny(h, H.story)) { intro.push(`### ${h}\n${s.body.trim()}`); continue }
      if (s.level === 3 && startsWithAny(h, H.story)) {
        const text = intro.join('\n\n')
        blocks.push(text === '' ? { story: n, part: 'intro', title: introTitle } : { story: n, part: 'intro', title: introTitle, text })
        blocks.push({ story: n, part: 'frames' })
        title = h.includes(':') ? h.slice(h.indexOf(':') + 1).trim() : ''
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
        const code = (['m1', 'm2', 'm3'] as const).find((c) => startsWithAny(h, H.parts[c]))
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
      if (s.level === 3 && startsWithAny(h, H.lists.observation)) { listHead('m1', 'observation', 'm1:observation'); takeTransclusions(s.body); continue }
      if (s.level === 3 && startsWithAny(h, H.lists.terms)) { listHead('m1', 'terms', 'm1:terms'); continue }
      if (s.level === 3 && startsWithAny(h, H.lists.discourse)) { listHead('m2', 'discourse', 'm2:discourse'); continue }
      if (s.level === 3 && (startsWithAny(h, H.lists.theology) || startsWithAny(h, H.lists.journal))) {
        const [part, list] = startsWithAny(h, H.lists.theology) ? ['m2', 'theology'] : ['m3', 'journal']
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
        takeTransclusions(s.body)
        for (const p of paras(withoutTransclusions(s.body))) {
          const [q, ...a] = p.split(/ {2}\n|\n/)
          const answer = a.join('\n').trim()
          questions.push({ story: n, part: 'm1', list: 'observation', k: nextK('m1'), frames: ids, q: q.trim(), ...(answer === '' ? {} : { a: answer }), ...(corrected ? { refText: h } : {}) })
        }
        continue
      }
      if (s.level === 4 && mode === 'm1:terms') {
        const { ids, corrected } = mapFrames(h)
        takeTransclusions(s.body)
        for (const p of paras(withoutTransclusions(s.body))) {
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
        takeTransclusions(s.body)
        const answer = paras(withoutTransclusions(s.body)).join('\n\n')
        questions.push({ story: n, part: 'm2', list: 'discourse', k: nextK('m2'), frames: ids, q, ...(answer === '' ? {} : { a: answer }), ...(m && mapped.some((x) => x.corrected) ? { refText: m[2].trim() } : {}) })
        continue
      }
      // A third-level heading that no list uses would lose its questions without a word: it is an error.
      // In a list of questions or terms, one that the conversion turned into a heading is the text of the question or term before it.
      // Not one that looks like the heading of a list, a part or a block that was misspelled: that one would take the questions below it with it.
      const looksLikeHeading = /^(pertanyaan|refleksi|dialog|percakapan|penafsiran|interpretasi|question|journal|theolog|discourse)/.test(fold(h))
      if (s.level === 3 && (mode === 'm1:observation' || mode === 'm1:terms') && !looksLikeHeading) {
        const last = mode === 'm1:observation' ? questions.filter((q) => q.story === n && q.list === 'observation').at(-1) : undefined
        const lastTerm = mode === 'm1:terms' ? terms.filter((t) => Math.floor(t.frame / 100) === n).at(-1) : undefined
        takeTransclusions(s.body)
        const text = [h, ...paras(withoutTransclusions(s.body))].join('\n')
        if (last !== undefined) last.a = last.a === undefined ? text : `${last.a}\n${text}`
        else if (lastTerm !== undefined) lastTerm.text = `${lastTerm.text}\n\n${text}`
        else {
          errors.push(`${where}: the heading ${JSON.stringify(h)} comes before any question or term of its list`)
          continue
        }
        warnings.push(`${where}: the heading ${JSON.stringify(h.slice(0, 60))} inside a list was taken as the text of the ${last !== undefined ? 'question' : 'term'} before it`)
        continue
      }
      if (s.level === 3 && mode !== '' && mode !== 'frames') errors.push(`${where}: the heading ${JSON.stringify(h)} is not a heading of a list or a block of this language`)
      if (s.level >= 1 && mode !== '') takeTransclusions(s.body)
    }
    closeBlock()

    // The frames of the story against the obs story's (checks 1, 2, 5, 6).
    const corr = lang === 'en' ? CORRESPONDENCE[n] : undefined
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
      if (title !== '' && normText(title) !== normText(st.title.replace(/^\d+\.\s*/, ''))) warnings.push(`${where}: title differs (manual «${title}» obs «${st.title}»)`)
      const obsRef = (st.reference ?? '').replace(/^[^:]*:\s*/, '')
      if (lang === 'en' && ref !== '' && normText(ref) !== normText(obsRef)) warnings.push(`${where}: reference differs (manual «${ref}» obs «${obsRef}»)`)
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
    const rows = tokenRows
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
