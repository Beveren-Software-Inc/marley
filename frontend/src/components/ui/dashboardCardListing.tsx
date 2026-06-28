import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'

export type CardMetaField = readonly [string, string | number | null | undefined]

/** Build multiline tooltip string (e.g. for row title fallback). */
export function cardRowMetaTitle(fields: readonly CardMetaField[]): string {
  return cardRowMetaFields(fields)
    .map(({ label, value }) => `${label}: ${value}`)
    .join('\n')
}

export function cardRowMetaFields(fields: readonly CardMetaField[]): { label: string; value: string }[] {
  return fields
    .filter(([, v]) => v != null && String(v).trim() !== '' && String(v) !== '—' && String(v) !== '-')
    .map(([label, v]) => ({ label, value: String(v) }))
}

/** Dashboard card rows: clickable, no row background on hover (details only via ⓘ popover). */
export const dashboardCardRowHoverClass = 'cursor-pointer'

export const DASHBOARD_CARD_POPOVER_SHELL_CLASS =
  'pointer-events-auto fixed z-[250] rounded-lg border border-emerald-200/90 bg-gradient-to-b from-emerald-50 via-emerald-50/95 to-teal-50/80 shadow-lg shadow-emerald-900/10 ring-1 ring-emerald-100/90'

function useDashboardCardPopover(popWidth: number, popHeight: number) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLSpanElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const updatePosition = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const width = Math.min(popWidth, window.innerWidth - 16)
    const height = Math.min(popHeight, window.innerHeight - 32)
    let left = r.left
    let top = r.bottom + 6
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - width - 8)
    }
    if (top + height > window.innerHeight - 8) {
      top = Math.max(8, r.top - height - 6)
    }
    setPos({ top, left })
  }, [popWidth, popHeight])

  const show = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    updatePosition()
    setOpen(true)
  }

  const scheduleHide = () => {
    hideTimer.current = setTimeout(() => setOpen(false), 120)
  }

  const cancelHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
  }

  const toggleOpen = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (open) {
      setOpen(false)
      return
    }
    show()
  }

  useEffect(() => {
    if (!open) return
    const onDoc = (e: Event) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', onDoc)
      document.addEventListener('touchstart', onDoc)
    }, 0)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('touchstart', onDoc)
    }
  }, [open])

  return {
    open,
    pos,
    triggerRef,
    popoverRef,
    show,
    scheduleHide,
    cancelHide,
    toggleOpen,
    popWidth: Math.min(popWidth, window.innerWidth - 16),
    popHeight: Math.min(popHeight, window.innerHeight - 32),
  }
}

/** Hover truncated text or ⓘ → larger emerald popover for multiline notes. */
export function CardRowTextHint({
  text,
  title = 'Nursing notes',
  popoverWidth = 420,
  popoverMaxHeight = 300,
}: {
  text?: string | null
  title?: string
  popoverWidth?: number
  popoverMaxHeight?: number
}) {
  const content = (text || '').trim()
  const {
    open,
    pos,
    triggerRef,
    popoverRef,
    show,
    scheduleHide,
    cancelHide,
    toggleOpen,
    popWidth,
    popHeight,
  } = useDashboardCardPopover(popoverWidth, popoverMaxHeight)

  if (!content) return <span className="text-slate-400">—</span>

  return (
    <>
      <span
        ref={triggerRef}
        className="inline-flex max-w-xs items-start gap-1"
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
      >
        <span className="block min-w-0 flex-1 truncate text-slate-700 cursor-help">{content}</span>
        <button
          type="button"
          className="inline-flex shrink-0 items-center justify-center rounded-full p-0.5 text-emerald-600/55 hover:text-emerald-900 hover:bg-emerald-100 hover:ring-1 hover:ring-emerald-200/80 cursor-help transition-colors"
          aria-label={`Show ${title.toLowerCase()}`}
          onClick={toggleOpen}
        >
          <Info className="w-3.5 h-3.5" strokeWidth={2.25} />
        </button>
      </span>
      {open &&
        createPortal(
          <div
            ref={popoverRef}
            role="tooltip"
            className={`${DASHBOARD_CARD_POPOVER_SHELL_CLASS} overflow-hidden text-emerald-950`}
            style={{ top: pos.top, left: pos.left, width: popWidth, maxHeight: popHeight }}
            onMouseEnter={cancelHide}
            onMouseLeave={scheduleHide}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3.5 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800/75 mb-2">
                {title}
              </p>
              <p className="max-h-[min(240px,calc(100vh-120px))] overflow-y-auto whitespace-pre-wrap break-words text-sm font-medium leading-relaxed text-emerald-950 [scrollbar-width:thin]">
                {content}
              </p>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

/** Hover ⓘ → emerald popover for a single text block (matches dashboard card tooltips). */
export function CardRowPopoverHint({
  content,
  title = 'Instructions',
  popoverWidth = 320,
  popoverMaxHeight = 240,
}: {
  content?: string | null
  title?: string
  popoverWidth?: number
  popoverMaxHeight?: number
}) {
  const text = (content || '').trim()
  const {
    open,
    pos,
    triggerRef,
    popoverRef,
    show,
    scheduleHide,
    cancelHide,
    toggleOpen,
    popWidth,
    popHeight,
  } = useDashboardCardPopover(popoverWidth, popoverMaxHeight)

  if (!text) return null

  return (
    <>
      <span
        ref={triggerRef}
        className="inline-flex shrink-0 items-center justify-center rounded-full p-0.5 text-emerald-600/55 hover:text-emerald-900 hover:bg-emerald-100 hover:ring-1 hover:ring-emerald-200/80 cursor-help transition-colors"
        aria-label={`Show ${title.toLowerCase()}`}
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
        onFocus={show}
        onBlur={scheduleHide}
        onClick={toggleOpen}
      >
        <Info className="w-3.5 h-3.5" strokeWidth={2.25} />
      </span>
      {open &&
        createPortal(
          <div
            ref={popoverRef}
            role="tooltip"
            className={`${DASHBOARD_CARD_POPOVER_SHELL_CLASS} overflow-hidden text-emerald-950`}
            style={{ top: pos.top, left: pos.left, width: popWidth, maxHeight: popHeight }}
            onMouseEnter={cancelHide}
            onMouseLeave={scheduleHide}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3.5 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800/75 mb-2">
                {title}
              </p>
              <p className="max-h-[min(240px,calc(100vh-120px))] overflow-y-auto whitespace-pre-wrap break-words text-sm font-medium leading-relaxed text-emerald-950 [scrollbar-width:thin]">
                {text}
              </p>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

/** Hover ⓘ → light green popover with IDs, practitioner, type, etc. */
export function CardRowMetaHint({ fields }: { fields: readonly CardMetaField[] }) {
  const items = cardRowMetaFields(fields)
  const metaPopoverHeight = Math.min(220, Math.max(120, items.length * 28 + 40))
  const {
    open,
    pos,
    triggerRef,
    popoverRef,
    show,
    scheduleHide,
    cancelHide,
    toggleOpen,
    popHeight,
  } = useDashboardCardPopover(280, metaPopoverHeight)

  if (!items.length) return null

  return (
    <>
      <span
        ref={triggerRef}
        className="inline-flex shrink-0 items-center justify-center rounded-full p-0.5 ml-1 text-emerald-600/55 hover:text-emerald-900 hover:bg-emerald-100 hover:ring-1 hover:ring-emerald-200/80 cursor-help transition-colors"
        aria-label="Show record details"
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
        onFocus={show}
        onBlur={scheduleHide}
        onClick={toggleOpen}
      >
        <Info className="w-3.5 h-3.5" strokeWidth={2.25} />
      </span>
      {open &&
        createPortal(
          <div
            ref={popoverRef}
            role="tooltip"
            className={`${DASHBOARD_CARD_POPOVER_SHELL_CLASS} w-[min(280px,calc(100vw-16px))] max-w-[calc(100vw-16px)] px-3 py-2.5 text-xs text-emerald-950`}
            style={{ top: pos.top, left: pos.left, maxHeight: popHeight }}
            onMouseEnter={cancelHide}
            onMouseLeave={scheduleHide}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800/75 mb-1.5">
              Record details
            </p>
            <dl className="space-y-1">
              {items.map(({ label, value }) => (
                <div key={label} className="flex gap-2 leading-snug">
                  <dt className="shrink-0 text-emerald-800/70">{label}</dt>
                  <dd className="font-medium text-emerald-950 break-words">{value}</dd>
                </div>
              ))}
            </dl>
          </div>,
          document.body,
        )}
    </>
  )
}

export function formatDashboardDate(val?: string | null): string {
  if (!val) return '—'
  try {
    return new Date(val).toLocaleDateString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return val
  }
}

export function stripHtmlToText(html: string | undefined): string {
  if (!html) return ''
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  return (tmp.textContent || tmp.innerText || '').trim().replace(/\s+/g, ' ')
}
