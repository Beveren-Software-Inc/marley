import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'

type DateChangeEvent = { target: { value: string } }

type ViewMonth = { year: number; month: number }

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** Monday-first labels — portal dates are read day-first (DD/MM/YYYY). */
const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

/** Calendar popover box (w-[17rem]); used to flip it above the field near the viewport bottom. */
const CALENDAR_WIDTH = 272
const CALENDAR_HEIGHT = 304

function toIsoDatePart(value: string | null | undefined): string {
  const m = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : ''
}

function toIso(y: number, mo: number, d: number): string | null {
  const dt = new Date(y, mo - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Accepts DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, YYYY-MM-DD and DDMMYYYY. */
function parseTypedDate(text: string): string | null {
  const t = text.trim()
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return toIso(Number(m[1]), Number(m[2]), Number(m[3]))
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (m) {
    let y = Number(m[3])
    if (y < 100) y += 2000
    return toIso(y, Number(m[2]), Number(m[1]))
  }
  m = t.match(/^(\d{2})(\d{2})(\d{4})$/)
  if (m) return toIso(Number(m[3]), Number(m[2]), Number(m[1]))
  return null
}

function toDisplay(iso: string): string {
  const part = toIsoDatePart(iso)
  const m = part.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

/** ISO (YYYY-MM-DD) for a calendar cell — always built from a real Date, so no validation. */
function isoOf(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function todayIso(): string {
  const now = new Date()
  return isoOf(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

function parseIso(iso: string): { year: number; month: number; day: number } | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
}

/** Month to show when the calendar opens: the selected date's month, otherwise today's. */
function viewOf(iso: string): ViewMonth {
  const parts = parseIso(iso)
  if (parts) return { year: parts.year, month: parts.month - 1 }
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() }
}

function shiftMonth(view: ViewMonth, delta: number): ViewMonth {
  const dt = new Date(view.year, view.month + delta, 1)
  return { year: dt.getFullYear(), month: dt.getMonth() }
}

/** Weeks of the month, Monday-first, padded with nulls so every row has 7 cells. */
function monthWeeks({ year, month }: ViewMonth): (string | null)[][] {
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (string | null)[] = Array.from({ length: firstWeekday }, () => null)
  for (let day = 1; day <= daysInMonth; day++) cells.push(isoOf(year, month + 1, day))
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

/**
 * Date field: type DD/MM/YYYY (or pick from the calendar). Value in/out stays
 * ISO YYYY-MM-DD via an event-shaped onChange, so it is a drop-in for
 * <input type="date"> — pass the same className you would give the native input.
 */
export function DateFilterInput({
  value,
  onChange,
  className = '',
  min,
  max,
  disabled = false,
  readOnly = false,
  required = false,
  placeholder = 'DD/MM/YYYY',
  title,
  id,
}: {
  value?: string | null
  onChange?: (e: DateChangeEvent) => void
  className?: string
  min?: string
  max?: string
  disabled?: boolean
  readOnly?: boolean
  required?: boolean
  placeholder?: string
  title?: string
  id?: string
}) {
  const isoValue = toIsoDatePart(value)
  const locked = disabled || readOnly
  const [text, setText] = useState(isoValue ? toDisplay(isoValue) : '')
  const [invalid, setInvalid] = useState(false)
  const focusedRef = useRef(false)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<ViewMonth>(() => viewOf(isoValue))
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const calendarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!focusedRef.current) {
      setText(isoValue ? toDisplay(isoValue) : '')
      setInvalid(false)
    }
  }, [isoValue])

  // The calendar is portalled to <body> with fixed coordinates so it is not clipped by the
  // scrollable cards/modals these fields live in — keep it glued to the field on scroll/resize.
  useLayoutEffect(() => {
    if (!open) return
    const updatePosition = () => {
      const el = rootRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const width = Math.min(CALENDAR_WIDTH, window.innerWidth - 16)
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
      let top = rect.bottom + 4
      if (top + CALENDAR_HEIGHT > window.innerHeight - 8) {
        top = Math.max(8, rect.top - CALENDAR_HEIGHT - 4)
      }
      setPosition({ top, left })
    }
    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (rootRef.current?.contains(target) || calendarRef.current?.contains(target)) return
      setOpen(false)
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  const inRange = (iso: string) => (!min || iso >= min) && (!max || iso <= max)

  const emit = (iso: string) => onChange?.({ target: { value: iso } })

  const handleTyping = (raw: string) => {
    setText(raw)
    if (open) setOpen(false)
    if (!raw.trim()) {
      setInvalid(false)
      if (isoValue) emit('')
      return
    }
    const iso = parseTypedDate(raw)
    if (iso && inRange(iso)) {
      setInvalid(false)
      if (iso !== isoValue) emit(iso)
    }
  }

  const commit = () => {
    focusedRef.current = false
    if (!text.trim()) {
      setInvalid(false)
      if (isoValue) emit('')
      setText('')
      return
    }
    const iso = parseTypedDate(text)
    if (iso && inRange(iso)) {
      setInvalid(false)
      setText(toDisplay(iso))
      if (iso !== isoValue) emit(iso)
    } else if (isoValue) {
      setInvalid(false)
      setText(toDisplay(isoValue))
    } else {
      setInvalid(true)
    }
  }

  const toggleCalendar = () => {
    if (locked) return
    setView(viewOf(isoValue))
    setOpen((prev) => !prev)
  }

  const selectDay = (iso: string) => {
    if (!inRange(iso)) return
    setInvalid(false)
    setText(toDisplay(iso))
    setOpen(false)
    if (iso !== isoValue) emit(iso)
  }

  const clearValue = () => {
    setInvalid(false)
    setText('')
    setOpen(false)
    if (isoValue) emit('')
  }

  const weeks = monthWeeks(view)
  const calendarWidth =
    typeof window !== 'undefined' ? Math.min(CALENDAR_WIDTH, window.innerWidth - 16) : CALENDAR_WIDTH

  const calendar =
    open && position && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={calendarRef}
            data-datefilter-calendar
            role="dialog"
            aria-label="Choose date"
            className="fixed rounded-lg border border-slate-200 bg-white p-2 shadow-xl"
            // 10001 keeps the calendar above the modals that host these fields (several use
            // z-index 10000) and above the toast stack at 9999.
            style={{ top: position.top, left: position.left, width: calendarWidth, zIndex: 10001 }}
            // Keep focus on the field while clicking month arrows / days so the field's
            // onBlur commit never fires mid-navigation (that is what dismissed the picker).
            onMouseDown={(e) => e.preventDefault()}
          >
            <div className="flex items-center justify-between gap-1 pb-1.5">
              <button
                type="button"
                onClick={() => setView((v) => shiftMonth(v, -1))}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                title="Previous month"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="text-sm font-semibold text-slate-800" aria-live="polite">
                {MONTH_NAMES[view.month]} {view.year}
              </div>
              <button
                type="button"
                onClick={() => setView((v) => shiftMonth(v, 1))}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                title="Next month"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-7">
              {WEEKDAY_LABELS.map((label) => (
                <div
                  key={label}
                  className="py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400"
                >
                  {label}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {weeks.map((week, weekIndex) =>
                week.map((iso, dayIndex) =>
                  iso ? (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => selectDay(iso)}
                      disabled={!inRange(iso)}
                      aria-pressed={iso === isoValue}
                      aria-label={toDisplay(iso)}
                      className={`h-7 rounded-md text-xs tabular-nums transition-colors ${
                        iso === isoValue
                          ? 'bg-primary font-semibold text-white hover:bg-primary/90'
                          : 'text-slate-700 hover:bg-slate-100'
                      } disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent`}
                    >
                      {parseIso(iso)?.day ?? iso.slice(8, 10)}
                    </button>
                  ) : (
                    <span key={`blank-${weekIndex}-${dayIndex}`} aria-hidden="true" />
                  )
                )
              )}
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
              <button
                type="button"
                onClick={() => selectDay(todayIso())}
                className="rounded px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/10"
              >
                Today
              </button>
              <button
                type="button"
                onClick={clearValue}
                className="rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              >
                Clear
              </button>
            </div>
          </div>,
          document.body
        )
      : null

  return (
    <>
      <div
        ref={rootRef}
        data-datefilter
        className={`relative flex items-center gap-1 pr-1 focus-within:ring-2 focus-within:ring-primary/40 ${
          invalid ? '!border-red-400 ring-1 ring-red-200' : ''
        } ${locked ? 'opacity-60' : ''} ${className}`}
        title={title}
      >
        <input
          data-datefilter-inner
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={text}
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          onChange={(e) => handleTyping(e.target.value)}
          onFocus={() => {
            if (!locked) focusedRef.current = true
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !locked) commit()
          }}
          placeholder={placeholder}
          className="w-full min-w-0 flex-1 border-0 bg-transparent p-0 text-inherit outline-none placeholder:text-slate-400"
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={locked}
          onClick={toggleCalendar}
          aria-label="Pick date"
          aria-haspopup="dialog"
          aria-expanded={open}
          title="Pick date"
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 transition-colors hover:text-primary disabled:cursor-not-allowed"
        >
          <Calendar className="h-4 w-4" />
        </button>
      </div>
      {calendar}
    </>
  )
}
