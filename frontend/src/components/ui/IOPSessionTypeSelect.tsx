import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchIOPSessionTypes, type IOPSessionType } from '../../services/iop'
import { CreateIOPSessionTypeModal } from './CreateIOPSessionTypeModal'
import {
  linkComboboxDropdownClassShort,
  linkComboboxInputClassCompact,
  linkComboboxOptionClassCompact,
} from './linkComboboxStyles'

interface IOPSessionTypeSelectProps {
  value: string
  onChange: (value: string) => void
  types?: IOPSessionType[]
  onTypesUpdated?: (types: IOPSessionType[]) => void
  className?: string
  placeholder?: string
}

export function IOPSessionTypeSelect({
  value,
  onChange,
  types: typesProp,
  onTypesUpdated,
  className = '',
  placeholder = 'Search session type...',
}: IOPSessionTypeSelectProps) {
  const [internalTypes, setInternalTypes] = useState<IOPSessionType[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const types = typesProp ?? internalTypes

  useEffect(() => {
    if (typesProp) return
    fetchIOPSessionTypes()
      .then(setInternalTypes)
      .catch(() => setInternalTypes([]))
  }, [typesProp])

  useEffect(() => {
    if (!value) {
      setQuery('')
      return
    }
    const match = types.find((t) => t.name === value)
    if (match) setQuery(match.session_type_name || match.name)
  }, [value, types])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const updateTypes = (next: IOPSessionType[]) => {
    if (typesProp && onTypesUpdated) onTypesUpdated(next)
    else setInternalTypes(next)
  }

  const filteredTypes = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return types
    return types.filter(
      (t) =>
        (t.session_type_name || t.name).toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q),
    )
  }, [types, query])

  const handleSelect = (opt: IOPSessionType) => {
    onChange(opt.name)
    setQuery(opt.session_type_name || opt.name)
    setOpen(false)
  }

  const handleClear = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onChange('')
    setQuery('')
    setOpen(false)
  }

  const handleCreated = (created: IOPSessionType) => {
    const option = {
      name: created.name,
      session_type_name: created.session_type_name || created.name,
    }
    const next = [option, ...types.filter((t) => t.name !== option.name)]
    updateTypes(next)
    handleSelect(option)
    setShowCreate(false)
  }

  return (
    <>
      <div ref={containerRef} className={`relative ${className}`}>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            if (value) onChange('')
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className={`${linkComboboxInputClassCompact} pr-16 hover:border-emerald-300/80`}
          autoComplete="off"
        />
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {value ? (
            <button
              type="button"
              onClick={handleClear}
              className="text-slate-400 transition-colors hover:text-slate-600"
              title="Clear session type"
              aria-label="Clear session type"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : null}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setShowCreate(true)
            }}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-white hover:bg-primary/90"
            title="Create new session type"
            aria-label="Create new session type"
          >
            +
          </button>
        </div>

        {open ? (
          <div className={linkComboboxDropdownClassShort}>
            {filteredTypes.length === 0 ? (
              <div className="px-3 py-2 text-xs text-slate-500">
                {query.trim() ? 'No session types match your search.' : 'No session types found.'}
              </div>
            ) : (
              filteredTypes.map((opt) => (
                <button
                  key={opt.name}
                  type="button"
                  className={`${linkComboboxOptionClassCompact} ${
                    value === opt.name ? 'bg-emerald-50/90 font-medium text-emerald-900' : ''
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(opt)}
                >
                  {opt.session_type_name || opt.name}
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>

      {showCreate ? (
        <CreateIOPSessionTypeModal
          onClose={() => setShowCreate(false)}
          onSuccess={handleCreated}
        />
      ) : null}
    </>
  )
}
