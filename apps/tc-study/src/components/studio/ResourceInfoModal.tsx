import React, { useCallback, useMemo, useState } from 'react'
import { X, FileText, Scale, Building2, Languages, Copy, Check, Loader } from 'lucide-react'
import { ModalPortal } from '../shared/ModalPortal'
import { MarkdownRenderer } from '../ui/MarkdownRenderer'

interface ResourceInfoModalProps {
  isOpen: boolean
  onClose: () => void
  resource: {
    title: string
    key: string
    owner?: string
    languageCode?: string
    subject?: string
    description?: string
    /** Catalog / release version when available (e.g. `v45`, `1.0.0`). */
    version?: string
    readme?: string
    license?: string
  }
  /** True while README is being fetched asynchronously (chrome already visible). */
  loadingBody?: boolean
}

const README_PROSE_CLASS =
  'text-sm text-fg leading-relaxed prose prose-sm max-w-none prose-headings:text-fg prose-p:text-fg-secondary prose-strong:text-fg prose-a:text-accent prose-li:text-fg-secondary prose-blockquote:text-fg-secondary'

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function formatVersionBadge(version: string): string {
  return /^v/i.test(version) ? version : `v${version}`
}

/** True when description is empty or already covered by the README body. */
function isDescriptionRedundant(description: string | undefined, readme: string | undefined): boolean {
  if (!description) return true
  if (!readme) return false
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()
  return norm(readme).includes(norm(description))
}

export function ResourceInfoModal({
  isOpen,
  onClose,
  resource,
  loadingBody = false,
}: ResourceInfoModalProps) {
  const [copied, setCopied] = useState(false)

  const title = asTrimmedString(resource.title) ?? 'Resource'
  const key = asTrimmedString(resource.key)
  const owner = asTrimmedString(resource.owner)
  const languageCode = asTrimmedString(resource.languageCode)?.toUpperCase()
  const subject = asTrimmedString(resource.subject)
  const description = asTrimmedString(resource.description)
  const version = asTrimmedString(resource.version)
  const readme = asTrimmedString(resource.readme)
  const license = asTrimmedString(resource.license)

  const showDescription = useMemo(
    () => !isDescriptionRedundant(description, readme),
    [description, readme]
  )

  const handleCopyKey = useCallback(async () => {
    if (!key) return
    try {
      await navigator.clipboard.writeText(key)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard may be unavailable; title tooltip still exposes the full key.
    }
  }, [key])

  if (!isOpen) return null

  const hasBody = Boolean(readme || showDescription)

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
          className="absolute inset-0 bg-overlay backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />

        <div
          className="relative bg-surface border border-border rounded-lg shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col m-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="resource-info-title"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Sticky chrome: title + chips + meta strip */}
          <div className="flex-shrink-0 border-b border-border-subtle bg-surface">
            <div className="flex items-start justify-between gap-3 px-content-lg pt-content pb-chrome">
              <div className="min-w-0 flex-1 space-y-chrome-tight">
                <div className="flex items-center gap-2 min-w-0">
                  <h2
                    id="resource-info-title"
                    className="text-lg font-semibold text-fg leading-snug truncate"
                    title={title}
                  >
                    {title}
                  </h2>
                  {version && (
                    <span
                      className="inline-flex items-center flex-shrink-0 px-2.5 py-1 rounded-md bg-muted text-sm font-semibold text-fg font-mono tracking-tight"
                      title={formatVersionBadge(version)}
                      aria-label={`Version ${formatVersionBadge(version)}`}
                    >
                      {formatVersionBadge(version)}
                    </span>
                  )}
                </div>

                {(owner || languageCode) && (
                  <div className="flex flex-wrap items-center gap-chrome-tight">
                    {owner && (
                      <span
                        className="inline-flex items-center gap-1 max-w-full px-2 py-0.5 rounded-md bg-muted text-caption text-fg-secondary"
                        title={owner}
                      >
                        <Building2 className="w-3 h-3 flex-shrink-0 text-fg-muted" aria-hidden="true" />
                        <span className="truncate">{owner}</span>
                      </span>
                    )}
                    {languageCode && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-caption text-fg-secondary"
                        title={languageCode}
                      >
                        <Languages className="w-3 h-3 flex-shrink-0 text-fg-muted" aria-hidden="true" />
                        <span>{languageCode}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 hover:bg-muted rounded-md transition-colors flex-shrink-0 text-fg-secondary"
                title="Close"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Meta strip — subject / key / license; no field labels */}
            {(subject || key || license) && (
              <div className="flex flex-wrap items-center gap-chrome-tight px-content-lg pb-content">
                {subject && (
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-md bg-accent-soft text-caption text-accent-fg truncate max-w-[12rem]"
                    title={subject}
                  >
                    {subject}
                  </span>
                )}

                {key && (
                  <button
                    type="button"
                    onClick={handleCopyKey}
                    className="inline-flex items-center gap-1 min-w-0 max-w-[14rem] px-2 py-0.5 rounded-md bg-accent-soft text-caption text-accent-fg font-mono hover:bg-muted transition-colors"
                    title={key}
                    aria-label={copied ? 'Copied resource key' : 'Copy resource key'}
                  >
                    <span className="truncate">{key}</span>
                    {copied ? (
                      <Check className="w-3 h-3 flex-shrink-0 text-accent" aria-hidden="true" />
                    ) : (
                      <Copy className="w-3 h-3 flex-shrink-0 opacity-70" aria-hidden="true" />
                    )}
                  </button>
                )}

                {license && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent-soft text-caption text-accent-fg"
                    title={license}
                  >
                    <Scale className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                    <span className="truncate max-w-[10rem]">{license}</span>
                  </span>
                )}
              </div>
            )}

            {showDescription && description && (
              <p className="px-content-lg pb-content text-sm text-fg-secondary leading-relaxed line-clamp-3">
                {description}
              </p>
            )}
          </div>

          {/* README — primary scrollable body */}
          <div className="flex-1 min-h-0 overflow-y-auto bg-canvas">
            {readme ? (
              <div className="p-content-lg">
                <MarkdownRenderer content={readme} className={README_PROSE_CLASS} />
              </div>
            ) : loadingBody ? (
              <div
                className="flex items-center justify-center py-16 text-fg-muted"
                role="status"
                aria-label="Loading"
                title="Loading"
              >
                <Loader className="w-8 h-8 animate-spin opacity-70" aria-hidden="true" />
              </div>
            ) : hasBody ? null : (
              <div
                className="flex items-center justify-center py-16 text-fg-muted"
                role="status"
                aria-label="No extended information available"
                title="No extended information available"
              >
                <FileText className="w-12 h-12 opacity-50" />
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
