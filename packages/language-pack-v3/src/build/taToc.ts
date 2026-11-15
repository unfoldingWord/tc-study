/**
 * The titles a tA manual's `toc.yaml` gives to its articles: an item with a `title` and a `link` names the article `link`; an item
 * with a `title` and no `link` is a heading and names nothing. The build adds those titles to the names of the articles in the map.
 *
 * No YAML library: only the plain shape of the tA repositories is read (`- title: "…"`, then `link: slug` on a line below, nested
 * `sections:`), values quoted or plain; any other line is ignored. No Node module is used.
 */

const unquote = (raw: string): string => {
  const s = raw.trim()
  if (s.length >= 2 && (s[0] === '"' || s[0] === "'") && s.at(-1) === s[0]) return s.slice(1, -1)
  return s.replace(/\s#.*$/, '').trim()
}

/** The `[link, title]` of each linked item of a `toc.yaml`, in the order written. `issues` and `where` are kept for the callers' reports. */
export function parseTaToc(text: string, _issues: string[] = [], _where = 'toc.yaml'): [string, string][] {
  const out: [string, string][] = []
  let title: string | undefined
  let link: string | undefined
  const flush = () => {
    if (title !== undefined && link !== undefined && title !== '' && link !== '') out.push([link, title])
    title = undefined
    link = undefined
  }
  for (const raw of text.split(/\r?\n/)) {
    const m = /^\s*(?:-\s+)?(title|link):\s*(.*)$/.exec(raw)
    if (m === null) continue
    const value = unquote(m[2])
    if (m[1] === 'title') {
      flush()
      title = value
    } else if (title !== undefined && link === undefined) link = value
  }
  flush()
  return out
}
