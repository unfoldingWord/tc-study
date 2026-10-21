import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Cpu,
  Download,
  Flame,
  Loader2,
  Maximize2,
  PanelBottom,
  RotateCcw,
  Square,
  Terminal,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { DownloadProgress } from '../../lib/services/BackgroundDownloadManager'
import type { ProcessStepEvent } from '../../features/debug/processStepRing'
import { warmScheduler } from '../../features/warm/warmScheduler'
import { getPrepareQueueStats, type PrepareQueueStats } from '../../workers/prepareClient'
import { getWarmQueueStats } from '../../workers/warmClient'
import { ModalPortal } from '../shared/ModalPortal'
import {
  formatDownloadQueueRowLabel,
  windowDownloadQueueSlice,
  type DownloadQueueRow,
  type DownloadQueueRowStatus,
} from './downloadQueueDetails'
import {
  buildProcessDebugModel,
  type ProcessWorkerSection,
} from './processDebugModel'

const QUEUE_ROW_HEIGHT = 36
const QUEUE_VIEWPORT_HEIGHT = 160
const EVENT_LOG_HEIGHT = 180
const DOCKED_QUEUE_VIEWPORT_HEIGHT = 120
const DOCKED_EVENT_LOG_HEIGHT = 120
const POLL_MS = 1000

interface DownloadQueueDetailsModalProps {
  open: boolean
  /**
   * When true, render as an in-flow bottom panel (Read shell reserves space).
   * When false, centered ModalPortal dialog overlay.
   */
  docked?: boolean
  /** CSS height for the docked panel shell (ignored in modal mode). */
  dockHeightCss?: string
  onClose: () => void
  onDock?: () => void
  onUndock?: () => void
  queue: readonly string[]
  completedResourceKeys: readonly string[]
  isDownloading: boolean
  error: string | null
  progress?: DownloadProgress | null
  blockedReason?: string | null
  lastActivityAt?: number | null
  recentSteps?: readonly ProcessStepEvent[]
  onRetry?: () => void
  onStop?: () => void
}

function StatusIcon({ status }: { status: DownloadQueueRowStatus }) {
  if (status === 'downloading') {
    return <Loader2 className="w-3.5 h-3.5 text-accent animate-spin shrink-0" aria-hidden />
  }
  if (status === 'checking') {
    return <Loader2 className="w-3.5 h-3.5 text-fg-muted animate-spin shrink-0" aria-hidden />
  }
  if (status === 'completed') {
    return <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" aria-hidden />
  }
  if (status === 'failed') {
    return <AlertCircle className="w-3.5 h-3.5 text-danger shrink-0" aria-hidden />
  }
  return <Clock className="w-3.5 h-3.5 text-fg-muted shrink-0" aria-hidden />
}

function QueueRowView({
  row,
  index,
  ingredient,
  resourceProgress,
}: {
  row: DownloadQueueRow
  index: number
  ingredient?: string | null
  resourceProgress?: number | null
}) {
  return (
    <div
      className="flex items-center gap-2 px-2 border-b border-border-subtle"
      style={{ height: QUEUE_ROW_HEIGHT }}
      title={row.resourceKey}
    >
      <span className="w-8 shrink-0 text-[10px] font-mono text-fg-muted text-right">
        {index + 1}
      </span>
      <StatusIcon status={row.status} />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-fg truncate">
          {formatDownloadQueueRowLabel(row)}
        </div>
        <div className="text-[10px] text-fg-muted truncate flex items-center gap-1.5">
          {row.owner ? <span className="truncate">{row.owner}</span> : null}
          {row.typeId ? (
            <span className="shrink-0 px-1 rounded bg-muted text-fg-secondary font-mono">
              {row.typeId}
            </span>
          ) : null}
          {ingredient ? <span className="truncate">→ {ingredient}</span> : null}
          {typeof resourceProgress === 'number' && resourceProgress > 0 ? (
            <span className="shrink-0 font-mono">{Math.round(resourceProgress)}%</span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function VirtualQueueList({
  items,
  currentIngredient,
  currentResourceProgress,
  currentResourceKey,
  viewportHeight = QUEUE_VIEWPORT_HEIGHT,
}: {
  items: readonly DownloadQueueRow[]
  currentIngredient?: string | null
  currentResourceProgress?: number | null
  currentResourceKey?: string | null
  viewportHeight?: number
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)

  const slice = useMemo(
    () =>
      windowDownloadQueueSlice({
        itemCount: items.length,
        scrollTop,
        viewportHeight,
        rowHeight: QUEUE_ROW_HEIGHT,
        overscan: 8,
      }),
    [items.length, scrollTop, viewportHeight]
  )

  const visible = items.slice(slice.start, slice.end)

  return (
    <div
      ref={scrollerRef}
      className="overflow-y-auto border border-border-subtle rounded-md bg-surface"
      style={{ height: viewportHeight }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      role="list"
      aria-label="Download queue"
    >
      <div style={{ height: slice.totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${slice.offsetY}px)` }}>
          {visible.map((row, offset) => {
            const index = slice.start + offset
            const isCurrent = row.resourceKey === currentResourceKey
            return (
              <div key={row.resourceKey} role="listitem">
                <QueueRowView
                  row={row}
                  index={index}
                  ingredient={isCurrent ? currentIngredient : null}
                  resourceProgress={isCurrent ? currentResourceProgress : null}
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function WorkerSectionIcon({ id }: { id: ProcessWorkerSection['id'] }) {
  if (id === 'warm') return <Flame className="w-3.5 h-3.5 text-fg-secondary shrink-0" aria-hidden />
  if (id === 'prepare') return <Cpu className="w-3.5 h-3.5 text-fg-secondary shrink-0" aria-hidden />
  return <Download className="w-3.5 h-3.5 text-fg-secondary shrink-0" aria-hidden />
}

function WorkerSectionView({ section }: { section: ProcessWorkerSection }) {
  return (
    <div className="border border-border-subtle rounded-md bg-surface overflow-hidden">
      <div className="flex items-center gap-2 px-2 py-1 border-b border-border-subtle">
        <WorkerSectionIcon id={section.id} />
        <span className="text-[10px] font-mono text-fg-muted truncate flex-1">{section.badge}</span>
        {section.active ? (
          <span
            className="text-[10px] font-mono text-fg-secondary truncate max-w-[45%]"
            title={section.active}
          >
            {section.active}
          </span>
        ) : null}
      </div>
      {section.lines.length > 0 ? (
        <div className="max-h-40 overflow-y-auto px-2 py-1 space-y-0.5">
          {section.lines.map((line, i) => (
            <div
              key={`${section.id}-${i}-${line.slice(0, 48)}`}
              className="text-[10px] font-mono text-fg-muted whitespace-pre-wrap break-all leading-snug"
              title={line}
            >
              {line}
            </div>
          ))}
        </div>
      ) : (
        <div className="px-2 py-2 text-fg-muted/50 flex justify-center">
          <Clock className="w-3.5 h-3.5" aria-hidden />
        </div>
      )}
    </div>
  )
}

function EventLogView({
  lines,
  height = EVENT_LOG_HEIGHT,
}: {
  lines: readonly string[]
  height?: number
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [lines])

  return (
    <div className="border border-border-subtle rounded-md bg-surface overflow-hidden flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-2 py-1 border-b border-border-subtle shrink-0">
        <Terminal className="w-3.5 h-3.5 text-fg-secondary shrink-0" aria-hidden />
        <span className="text-[10px] font-mono text-fg-muted">{lines.length}</span>
      </div>
      <div
        ref={scrollerRef}
        className="overflow-y-auto px-2 py-1 space-y-0.5"
        style={{ height }}
        role="log"
        aria-label="Process step events"
      >
        {lines.length === 0 ? (
          <div className="flex justify-center py-4 text-fg-muted/40">
            <Terminal className="w-4 h-4" aria-hidden />
          </div>
        ) : (
          lines.map((line, i) => (
            <div
              key={`evt-${i}-${line.slice(0, 40)}`}
              className="text-[10px] font-mono text-fg-muted whitespace-pre-wrap break-all leading-snug"
              title={line}
            >
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export function DownloadQueueDetailsModal({
  open,
  docked = false,
  dockHeightCss = 'min(40vh, 360px)',
  onClose,
  onDock,
  onUndock,
  queue,
  completedResourceKeys,
  isDownloading,
  error,
  progress,
  blockedReason,
  lastActivityAt,
  recentSteps,
  onRetry,
  onStop,
}: DownloadQueueDetailsModalProps) {
  const [warmStats, setWarmStats] = useState(() => warmScheduler.getStats())
  const [warmWorkerQueue, setWarmWorkerQueue] = useState<Awaited<
    ReturnType<typeof getWarmQueueStats>
  > | null>(null)
  const [prepareStats, setPrepareStats] = useState<PrepareQueueStats | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!open) return
    return warmScheduler.subscribe(setWarmStats)
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const tick = async () => {
      setNow(Date.now())
      const [warmQ, prep] = await Promise.all([
        getWarmQueueStats().catch(() => null),
        getPrepareQueueStats().catch(() => null),
      ])
      if (cancelled) return
      setWarmWorkerQueue(warmQ)
      setPrepareStats(prep)
    }
    void tick()
    const id = setInterval(() => void tick(), POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [open])

  const model = useMemo(
    () =>
      buildProcessDebugModel({
        queue,
        completedResourceKeys,
        isDownloading,
        error,
        progress,
        blockedReason,
        lastActivityAt,
        recentSteps,
        warm: warmStats,
        warmWorkerQueue,
        prepare: prepareStats,
        now,
      }),
    [
      queue,
      completedResourceKeys,
      isDownloading,
      error,
      progress,
      blockedReason,
      lastActivityAt,
      recentSteps,
      warmStats,
      warmWorkerQueue,
      prepareStats,
      now,
    ]
  )

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const queueViewportHeight = docked ? DOCKED_QUEUE_VIEWPORT_HEIGHT : QUEUE_VIEWPORT_HEIGHT
  const eventLogHeight = docked ? DOCKED_EVENT_LOG_HEIGHT : EVENT_LOG_HEIGHT

  const headerActions = (
    <>
      {onStop && isDownloading ? (
        <button
          type="button"
          onClick={onStop}
          className="p-1.5 hover:bg-muted rounded-md"
          title="Stop download"
          aria-label="Stop download"
        >
          <Square className="w-3.5 h-3.5 text-fg-secondary" />
        </button>
      ) : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="p-1.5 hover:bg-muted rounded-md"
          title="Retry download"
          aria-label="Retry download"
        >
          <RotateCcw className="w-3.5 h-3.5 text-fg-secondary" />
        </button>
      ) : null}
      {docked ? (
        onUndock ? (
          <button
            type="button"
            onClick={onUndock}
            className="p-1.5 hover:bg-muted rounded-md"
            title="Undock to modal"
            aria-label="Undock to modal"
          >
            <Maximize2 className="w-3.5 h-3.5 text-fg-secondary" />
          </button>
        ) : null
      ) : onDock ? (
        <button
          type="button"
          onClick={onDock}
          className="p-1.5 hover:bg-muted rounded-md"
          title="Dock to bottom"
          aria-label="Dock to bottom"
        >
          <PanelBottom className="w-3.5 h-3.5 text-fg-secondary" />
        </button>
      ) : null}
      <button
        type="button"
        onClick={onClose}
        className="p-1.5 hover:bg-muted rounded-md"
        title="Close"
        aria-label="Close"
      >
        <X className="w-4 h-4 text-fg-secondary" />
      </button>
    </>
  )

  const header = (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle shrink-0">
      <Cpu className="w-4 h-4 text-fg-secondary" aria-hidden />
      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
        <span className="px-1.5 py-0.5 bg-muted text-fg rounded-full text-[10px] font-mono font-semibold">
          {model.completed}/{model.total}
        </span>
        <span className="text-[10px] font-mono text-fg-muted">{model.percent}%</span>
        <span className="px-1 rounded bg-muted text-fg-secondary font-mono text-[10px]">
          {model.phase}
        </span>
        {model.download.completedCount > 0 ? (
          <span
            className="flex items-center gap-1 text-[10px] text-fg-muted font-mono"
            title="Completed resources"
            aria-label={`${model.download.completedCount} completed`}
          >
            <CheckCircle2 className="w-3 h-3 text-green-500" aria-hidden />
            {model.download.completedCount}
          </span>
        ) : null}
        {model.lastActivityLabel ? (
          <span
            className="flex items-center gap-1 text-[10px] font-mono text-fg-muted"
            title={`Since last progress ${model.lastActivityLabel}`}
            aria-label={`Since last progress ${model.lastActivityLabel}`}
          >
            <Clock className="w-3 h-3" aria-hidden />
            {model.lastActivityLabel}
          </span>
        ) : null}
        {isDownloading ? (
          <Loader2 className="w-3.5 h-3.5 text-accent animate-spin" aria-hidden />
        ) : error || model.blockedReason ? (
          <span
            title={model.blockedReason || error || undefined}
            aria-label={model.blockedReason || error || 'blocked'}
          >
            <AlertCircle className="w-3.5 h-3.5 text-danger" aria-hidden />
          </span>
        ) : null}
      </div>
      {headerActions}
    </div>
  )

  const body = (
    <>
      {model.blockedReason ? (
        <div className="px-3 py-1.5 border-b border-border-subtle text-[10px] font-mono text-danger break-all">
          {model.blockedReason}
        </div>
      ) : null}

      {model.download.current ? (
        <div className="px-3 py-1.5 border-b border-border-subtle shrink-0 space-y-0.5">
          <div className="flex items-center gap-2 text-xs text-fg">
            <StatusIcon status={model.download.current.status} />
            <span className="font-medium truncate">
              {formatDownloadQueueRowLabel(model.download.current)}
            </span>
            {model.download.current.typeId ? (
              <span className="shrink-0 px-1 rounded bg-muted text-fg-secondary font-mono text-[10px]">
                {model.download.current.typeId}
              </span>
            ) : null}
          </div>
          <div className="pl-5 text-[10px] text-fg-muted truncate font-mono">
            {model.download.current.resourceKey}
          </div>
          {progress?.currentIngredient ? (
            <div className="pl-5 text-[10px] text-fg-secondary truncate font-mono">
              → {progress.currentIngredient}
            </div>
          ) : null}
          {typeof progress?.currentResourceProgress === 'number' &&
          progress.currentResourceProgress > 0 ? (
            <div className="pl-5 h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-300"
                style={{
                  width: `${Math.min(100, Math.max(0, progress.currentResourceProgress))}%`,
                }}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="px-3 py-2 flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
        <div className="space-y-1.5 shrink-0">
          {model.sections.map((section) => (
            <WorkerSectionView key={section.id} section={section} />
          ))}
        </div>

        <EventLogView lines={model.eventLog} height={eventLogHeight} />

        <div className="flex items-center gap-2 text-[10px] text-fg-muted font-mono shrink-0 pt-0.5">
          <Clock className="w-3 h-3" aria-hidden />
          <span>
            {model.download.queuedCount}
            {model.download.totalCount > model.download.queuedCount
              ? ` · ${model.download.totalCount}`
              : ''}
          </span>
        </div>
        {model.download.rows.length === 0 ? (
          <div className="flex items-center justify-center py-4 text-fg-muted">
            <Download className="w-6 h-6 opacity-40" aria-hidden />
          </div>
        ) : (
          <VirtualQueueList
            items={model.download.rows}
            currentIngredient={progress?.currentIngredient}
            currentResourceProgress={progress?.currentResourceProgress}
            currentResourceKey={progress?.currentResource}
            viewportHeight={queueViewportHeight}
          />
        )}
      </div>
    </>
  )

  if (docked) {
    // In-flow shell: Read flex column shrinks the middle panels area.
    // Do not use ModalPortal / fixed overlay — that would cover panels.
    return (
      <div
        className="flex-shrink-0 flex flex-col bg-elevated border-t border-border shadow-[0_-4px_16px_rgba(0,0,0,0.12)] min-h-0 overflow-hidden"
        style={{ height: dockHeightCss }}
        role="complementary"
        aria-label="Process debug"
        data-process-debug-docked="true"
        data-process-debug-layout="reserved"
      >
        {header}
        {body}
      </div>
    )
  }

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-overlay p-3"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label="Process debug"
      >
        <div
          className="bg-elevated rounded-lg shadow-xl border border-border w-full max-w-2xl max-h-[min(94vh,860px)] flex flex-col"
          onClick={(event) => event.stopPropagation()}
        >
          {header}
          {body}
        </div>
      </div>
    </ModalPortal>
  )
}
