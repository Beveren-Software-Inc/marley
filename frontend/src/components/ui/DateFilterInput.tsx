import { useEffect, useRef, useState } from 'react'
import { Calendar } from 'lucide-react'

type DateChangeEvent = { target: { value: string } }

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

  useEffect(() => {
    if (!focusedRef.current) {
      setText(isoValue ? toDisplay(isoValue) : '')
      setInvalid(false)
    }
  }, [isoValue])

  const inRange = (iso: string) => (!min || iso >= min) && (!max || iso <= max)

  const emit = (iso: string) => onChange?.({ target: { value: iso } })

  const handleTyping = (raw: string) => {
    setText(raw)
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

  return (
    <div
      data-datefilter
      className={`relative flex items-center gap-1 focus-within:ring-2 focus-within:ring-primary/40 ${
        invalid ? '!border-red-400 ring-1 ring-red-200' : ''
      } ${locked ? 'opacity-60' : ''} ${className}`}
      title={title}
    >
      <input
        data-datefilter-inner
        id={id}
        type="text"
        inputMode="numeric"
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
      <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center text-slate-400 hover:text-primary">
        <Calendar className="h-4 w-4" />
        <input
          data-datefilter-inner
          type="date"
          tabIndex={-1}
          value={isoValue}
          min={min}
          max={max}
          disabled={locked}
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
            cursor: locked ? 'not-allowed' : 'pointer',
          }}
          aria-label="Pick date"
        />
      </span>
    </div>
  )
}
