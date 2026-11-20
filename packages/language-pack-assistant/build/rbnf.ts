/**
 * A small evaluator of CLDR RBNF rules for non-negative integers: enough for `spellout-numbering` and `spellout-cardinal-*` of
 * Spanish, Portuguese and English from 0 to 200 and well beyond. Build-time code; the assistant itself ships the words it makes.
 * Handles `>>`, `<<`, `=%set=`, `<%set<`, `>%set>`, `[optional]`, `'` (a kept leading space), `base/radix` and the plural `$(cardinal,..)$`.
 * Negative, fractional and infinite rules are ignored.
 */

export type RbnfRule = { base: number; radix: number; text: string }
/** The rule sets of one language by name (`spellout-numbering`, `%%optional-e` as `optional-e`). */
export type RbnfRuleSet = Record<string, RbnfRule[]>

/** Reads the text of a `<lang>-SpelloutRules.txt` file. */
export function parseRules(text: string): RbnfRuleSet {
  const sets: RbnfRuleSet = {}
  let current: RbnfRule[] | undefined
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '' || raw.startsWith('#')) continue
    const head = /^%+([A-Za-z0-9-]+):\s*$/.exec(raw)
    if (head) {
      current = []
      sets[head[1]!] = current
      continue
    }
    if (!current) continue
    const m = /^(\d+)(?:\/(\d+))?:\s?(.*)$/.exec(raw)
    if (!m) continue // -x, x.x, x,x, Inf, NaN
    let body = m[3]!
    if (body.endsWith(';')) body = body.slice(0, -1)
    if (body.startsWith("'")) body = body.slice(1)
    current.push({ base: Number(m[1]), radix: m[2] === undefined ? 10 : Number(m[2]), text: body })
  }
  for (const rules of Object.values(sets)) rules.sort((a, b) => a.base - b.base)
  return sets
}

function divisorOf(rule: RbnfRule): number {
  if (rule.base < 1) return 1
  let d = 1
  while (d * rule.radix <= rule.base) d *= rule.radix
  return d
}

const TOKEN = /<<|>>>|>>|<%%?[A-Za-z0-9-]+<|>%%?[A-Za-z0-9-]+>|=%%?[A-Za-z0-9-]+=|=[#,0.]+=|\$\(cardinal,([^)]*)\)\$|\[|\]/g

function format(rules: RbnfRuleSet, set: string, n: number, depth = 0): string {
  const list = rules[set]
  if (list === undefined) throw new Error(`no rule set ${set}`)
  if (depth > 40) throw new Error('rules loop')
  let rule: RbnfRule | undefined
  for (const r of list) if (r.base <= n) rule = r
  if (rule === undefined) throw new Error(`no rule for ${n} in ${set}`)
  const div = divisorOf(rule)
  const quotient = Math.floor(n / div)
  const rest = n % div
  let out = ''
  let optional = 0 // depth of the bracket being skipped
  let last = 0
  const push = (s: string): void => {
    if (optional === 0) out += s
  }
  for (const m of rule.text.matchAll(TOKEN)) {
    push(rule.text.slice(last, m.index))
    last = m.index! + m[0].length
    const t = m[0]
    if (t === '[') {
      if (rest === 0) optional++
      else if (optional > 0) optional++
    } else if (t === ']') {
      if (optional > 0) optional--
    } else if (optional > 0) {
      // skipped
    } else if (t === '<<') push(format(rules, set, quotient, depth + 1))
    else if (t === '>>') push(format(rules, set, rest, depth + 1))
    else if (t === '>>>') push(format(rules, set, rest, depth + 1))
    else if (t.startsWith('<%')) push(format(rules, t.replace(/^<%+|<$/g, ''), quotient, depth + 1))
    else if (t.startsWith('>%')) push(format(rules, t.replace(/^>%+|>$/g, ''), rest, depth + 1))
    else if (t.startsWith('=%')) push(format(rules, t.replace(/^=%+|=$/g, ''), n, depth + 1))
    else if (t.startsWith('=')) push(String(n))
    else if (t.startsWith('$(')) {
      const forms = new Map([...(m[1] ?? '').matchAll(/(\w+)\{([^}]*)\}/g)].map((x) => [x[1]!, x[2]!]))
      push(forms.get(quotient === 1 ? 'one' : 'other') ?? forms.get('other') ?? '')
    }
  }
  push(rule.text.slice(last))
  return out
}

/** The words of the integer `n` (0 or more) in a rule set, `spellout-numbering` by default: 21 in Spanish is "veintiuno". */
export function spellout(rules: RbnfRuleSet, n: number, set = 'spellout-numbering'): string {
  if (!Number.isInteger(n) || n < 0) throw new Error('spellout takes an integer of 0 or more')
  return format(rules, set, n).replace(/\s+/g, ' ').trim()
}
