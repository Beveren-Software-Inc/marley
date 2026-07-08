import { useEffect, useRef, useState } from 'react'
import { Calendar } from 'lucide-react'

type DateChangeEvent = { target: { value: string } }

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
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

/**
 * Date filter field: type the date in any common format (DD/MM/YYYY, DD-MM-YYYY,
 * YYYY-MM-DD, DDMMYYYY) or pick it from the calendar. Value in/out stays ISO
 * YYYY-MM-DD via an event-shaped onChange, so it is a drop-in replacement for
 * <input type="date"> — pass the same className you would give the native input.
 */
export function DateFilterInput({
  value,
  onChange,
  className = '',
  min,
  max,
  disabled = false,
  placeholder = 'DD/MM/YYYY',
  title,
}: {
  value: string
  onChange: (e: DateChangeEvent) => void
  className?: string
  min?: string
  max?: string
  disabled?: boolean
  placeholder?: string
  title?: string
}) {
  const [text, setText] = useState(value ? toDisplay(value) : '')
  const [invalid, setInvalid] = useState(false)
  const focusedRef = useRef(false)

  // Follow external value changes (clear filters, defaults) when not mid-typing.
  useEffect(() => {
    if (!focusedRef.current) {
      setText(value ? toDisplay(value) : '')
      setInvalid(false)
    }
  }, [value])

  const inRange = (iso: string) => (!min || iso >= min) && (!max || iso <= max)

  const emit = (iso: string) => onChange({ target: { value: iso } })

  const handleTyping = (raw: string) => {
    setText(raw)
    if (!raw.trim()) {
      setInvalid(false)
      if (value) emit('')
      return
    }
    const iso = parseTypedDate(raw)
    if (iso && inRange(iso)) {
      setInvalid(false)
      if (iso !== value) emit(iso)
    }
  }

  const commit = () => {
    focusedRef.current = false
    if (!text.trim()) {
      setInvalid(false)
      if (value) emit('')
      setText('')
      return
    }
    const iso = parseTypedDate(text)
    if (iso && inRange(iso)) {
      setInvalid(false)
      setText(toDisplay(iso))
      if (iso !== value) emit(iso)
    } else if (value) {
      // Unparseable — fall back to the last valid date.
      setInvalid(false)
      setText(toDisplay(value))
    } else {
      setInvalid(true)
    }
  }

  return (
    <div
      data-datefilter
      className={`relative flex items-center gap-1 focus-within:ring-2 focus-within:ring-primary/40 ${
        invalid ? '!border-red-400 ring-1 ring-red-200' : ''
      } ${disabled ? 'opacity-60' : ''} ${className}`}
      title={title}
    >
      <input
        data-datefilter-inner
        type="text"
        inputMode="numeric"
        value={text}
        disabled={disabled}
        onChange={(e) => handleTyping(e.target.value)}
        onFocus={() => {
          focusedRef.current = true
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
        }}
        placeholder={placeholder}
        className="w-full min-w-0 flex-1 border-0 bg-transparent p-0 text-inherit outline-none placeholder:text-slate-400"
      />
      {/* The native date input sits invisibly over the icon: clicking it opens the
          native calendar, which also dismisses natively on outside clicks (a picker
          opened via showPicker() on a hidden input gets stuck in Chromium). */}
      <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center text-slate-400 hover:text-primary">
        <Calendar className="h-4 w-4" />
        <input
          data-datefilter-inner
          type="date"
          tabIndex={-1}
          value={value || ''}
          min={min}
          max={max}
          disabled={disabled}
          onChange={(e) => {
            const iso = e.target.value
            setInvalid(false)
            setText(iso ? toDisplay(iso) : '')
            emit(iso)
          }}
          className="datefilter-picker"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
          aria-label="Pick date"
        />
      </span>
    </div>
  )
}
