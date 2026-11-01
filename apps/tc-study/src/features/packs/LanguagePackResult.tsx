import { AlertTriangle, BookOpen, CheckCircle2, Info, Loader2, PackageX } from 'lucide-react'
import type { ImportPackResult, PackLayer } from '@bt-synergy/language-pack'
import type { OpenedPack, PackProgress, PackRefusal } from './openLanguagePacks'

const LAYER_NAMES: Record<PackLayer, string> = {
  receipt: 'Receipts',
  sot: 'Texts',
  prepared: 'Prepared views',
  quote: 'Quotes',
  align: 'Aligned quotes',
  text: 'Article titles',
  index: 'Word index',
}

const REFUSALS: Record<PackRefusal, string> = {
  'not-a-pack': 'Not a language pack this app can open',
  'other-version': 'Made with another version of the app: it cannot be opened here',
  'no-space': 'Not enough space on this device',
  damaged: 'The pack broke while opening: get a new copy and open it again',
}

const resourceIdOf = (key: string) => (key.split('/')[2] ?? key).toUpperCase()
const languageOf = (key: string) => key.split('/')[1] ?? key

const NOTE = 'flex items-start gap-1.5 text-sm'
const ICON = 'w-4 h-4 mt-0.5 shrink-0'

/** Resources the pack brought rows for, less those the device kept as they were. */
function openedResources(result: ImportPackResult): string[] {
  const kept = new Set(result.skippedResources.map((r) => r.key))
  return result.manifest.resources
    .filter((r) => !kept.has(r.key) && Object.values(r.rows).some((n) => (n ?? 0) > 0))
    .map((r) => r.key)
}

function OpenedRow({ name, kind, result, ms }: Extract<OpenedPack, { result: ImportPackResult }>) {
  const resources = openedResources(result)
  const languages = [...new Set(resources.map(languageOf))]
  const books = kind === 'book' ? (result.manifest.books ?? []) : []
  const leftOut = result.skippedLayers.map((layer) => LAYER_NAMES[layer]).join(', ')
  return (
    <li
      className="p-3 rounded-lg border border-border bg-surface space-y-2"
      data-testid="language-pack-opened"
      data-pack-name={name}
      data-pack-kind={kind}
      data-pack-ms={ms}
      title={`${result.written} / ${result.keptExisting}`}
    >
      <div className="flex items-center gap-2 text-fg font-medium">
        <CheckCircle2 className="w-4 h-4 text-accent shrink-0" aria-hidden />
        <span>{languages.join(', ')}</span>
        <span className="text-xs text-fg-muted truncate">{name}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {resources.map((key) => (
          <span key={key} title={key} className="px-2 py-0.5 rounded-full bg-accent-soft text-accent-fg text-xs font-medium">
            {resourceIdOf(key)}
          </span>
        ))}
      </div>
      {books.length > 0 && (
        <div className={`${NOTE} text-fg-secondary`}>
          <BookOpen className={ICON} aria-label="Books" />
          <span>{books.map((book) => book.toUpperCase()).join(' ')}</span>
        </div>
      )}
      {leftOut && (
        <p className={`${NOTE} text-fg-secondary`}>
          <Info className={ICON} aria-hidden />
          <span>{leftOut} will be prepared again on this device</span>
        </p>
      )}
      {result.originals.map((original) =>
        original.status === 'missing' ? (
          <p key={original.key} className={`${NOTE} text-warning-fg`}>
            <AlertTriangle className={ICON} aria-hidden />
            <span>{resourceIdOf(original.key)} is missing: open the originals pack too</span>
          </p>
        ) : original.status === 'other-release' ? (
          <p key={original.key} className={`${NOTE} text-fg-secondary`}>
            <Info className={ICON} aria-hidden />
            <span>{resourceIdOf(original.key)} here is another release: its quotes will be prepared again on this device</span>
          </p>
        ) : null
      )}
      {result.skippedResources.map((resource) => (
        <p key={resource.key} className={`${NOTE} text-fg-secondary`} title={resource.why}>
          <Info className={ICON} aria-hidden />
          <span>{resourceIdOf(resource.key)}: kept as it was on this device</span>
        </p>
      ))}
    </li>
  )
}

function RefusedRow({ name, refused, detail }: Extract<OpenedPack, { refused: PackRefusal }>) {
  return (
    <li
      className="p-3 rounded-lg border border-border bg-danger-soft space-y-1"
      data-testid="language-pack-refused"
      data-pack-name={name}
      title={detail}
    >
      <div className="flex items-center gap-2 text-danger font-medium">
        <PackageX className="w-4 h-4 shrink-0" aria-hidden />
        <span className="truncate">{name}</span>
      </div>
      <p className="text-sm text-fg">{REFUSALS[refused]}</p>
    </li>
  )
}

function ProgressRow({ progress }: { progress: PackProgress }) {
  const percent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
  return (
    <div className="p-3 rounded-lg border border-border bg-surface space-y-2" data-testid="language-pack-progress">
      <div className="flex items-center gap-2 text-sm text-fg">
        <Loader2 className="w-4 h-4 animate-spin text-accent shrink-0" aria-hidden />
        <span className="truncate">{progress.name}</span>
        {progress.count > 1 && (
          <span className="ml-auto text-xs text-fg-muted">
            {progress.index + 1}/{progress.count}
          </span>
        )}
      </div>
      <div
        className="h-1.5 rounded-full bg-muted overflow-hidden"
        role="progressbar"
        aria-label={progress.name}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className="h-full bg-accent transition-all" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

export function LanguagePackResult({ progress, opened }: { progress: PackProgress | null; opened: OpenedPack[] | null }) {
  if (progress) return <ProgressRow progress={progress} />
  if (!opened?.length) return null
  return (
    <ul className="space-y-2 text-left" data-testid="language-pack-result">
      {opened.map((pack) =>
        'result' in pack ? <OpenedRow key={pack.name} {...pack} /> : <RefusedRow key={pack.name} {...pack} />
      )}
    </ul>
  )
}
