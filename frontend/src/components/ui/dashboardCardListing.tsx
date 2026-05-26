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

/** Hover ⓘ → light green popover with IDs, practitioner, type, etc. */
export function CardRowMetaHint({ fields }: { fields: readonly CardMetaField[] }) {
  const items = cardRowMetaFields(fields)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLSpanElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const updatePosition = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const popW = Math.min(280, window.innerWidth - 16)
    const popH = Math.min(220, Math.max(120, items.length * 28 + 40))
    let left = r.left
    let top = r.bottom + 6
    if (left + popW > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - popW - 8)
    }
    if (top + popH > window.innerHeight - 8) {
      top = Math.max(8, r.top - popH - 6)
    }
    setPos({ top, left })
  }, [items.length])

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
            className="pointer-events-auto fixed z-[250] w-[min(280px,calc(100vw-16px))] max-w-[calc(100vw-16px)] rounded-lg border border-emerald-200/90 bg-gradient-to-b from-emerald-50 via-emerald-50/95 to-teal-50/80 px-3 py-2.5 text-xs text-emerald-950 shadow-lg shadow-emerald-900/10 ring-1 ring-emerald-100/90"
            style={{ top: pos.top, left: pos.left }}
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
