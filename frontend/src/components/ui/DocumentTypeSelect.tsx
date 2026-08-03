import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { fetchDocumentTypes, type DocumentTypeOption } from '../../services/common'
import { CreateDocumentTypeModal } from './CreateDocumentTypeModal'
import {
  linkComboboxInputClassCompact,
  linkComboboxOptionClassCompact,
} from './linkComboboxStyles'

interface DocumentTypeSelectProps {
  value: string
  onChange: (value: string) => void
  types?: DocumentTypeOption[]
  onTypesUpdated?: (types: DocumentTypeOption[]) => void
  className?: string
  placeholder?: string
}

const DROPDOWN_MAX_H = 192 // max-h-48
const DROPDOWN_GAP = 6

export function DocumentTypeSelect({
  value,
  onChange,
  types: typesProp,
  onTypesUpdated,
  className = '',
  placeholder = 'Search document type...',
}: DocumentTypeSelectProps) {
  const [internalTypes, setInternalTypes] = useState<DocumentTypeOption[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [menuPos, setMenuPos] = useState<{
    top: number
    left: number
    width: number
    openUp: boolean
  } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const types = typesProp ?? internalTypes

  const filteredTypes = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return types
    return types.filter(
      (t) =>
        (t.document_name || t.name).toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q),
    )
  }, [types, query])

  useEffect(() => {
    if (typesProp) return
    fetchDocumentTypes()
      .then(setInternalTypes)
      .catch(() => setInternalTypes([]))
  }, [typesProp])

  useEffect(() => {
    if (!value) {
      setQuery('')
      return
    }
    const match = types.find((t) => t.name === value)
    if (match) setQuery(match.document_name || match.name)
  }, [value, types])

  const updateMenuPosition = () => {
    const el = inputRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    // Open upward when there isn't room below (common in the signatures section).
    const openUp = spaceBelow < DROPDOWN_MAX_H + DROPDOWN_GAP && spaceAbove > spaceBelow
    setMenuPos({
      top: openUp ? rect.top - DROPDOWN_GAP : rect.bottom + DROPDOWN_GAP,
      left: rect.left,
      width: rect.width,
      openUp,
    })
  }

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null)
      return
    }
    updateMenuPosition()
    const onScrollOrResize = () => updateMenuPosition()
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [open, filteredTypes.length])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (containerRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const updateTypes = (next: DocumentTypeOption[]) => {
    if (typesProp && onTypesUpdated) onTypesUpdated(next)
    else setInternalTypes(next)
  }

  const handleSelect = (opt: DocumentTypeOption) => {
    onChange(opt.name)
    setQuery(opt.document_name || opt.name)
    setOpen(false)
  }

  const handleClear = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onChange('')
    setQuery('')
    setOpen(false)
  }

  const handleCreated = (created: DocumentTypeOption) => {
    const option = {
      name: created.name,
      document_name: created.document_name || created.name,
    }
    const next = [option, ...types.filter((t) => t.name !== option.name)]
    updateTypes(next)
    handleSelect(option)
    setShowCreate(false)
  }

  const menuEl =
    open && menuPos && typeof document !== 'undefined' ? (
      <div
        ref={menuRef}
        data-document-type-select-menu
        className="fixed z-[9999] max-h-48 overflow-y-auto rounded-xl border border-emerald-200/80 bg-white py-1 text-slate-900 shadow-lg ring-1 ring-emerald-300/40"
        style={{
          top: menuPos.openUp ? undefined : menuPos.top,
          bottom: menuPos.openUp ? window.innerHeight - menuPos.top : undefined,
          left: menuPos.left,
          width: menuPos.width,
        }}
      >
        {filteredTypes.length === 0 ? (
          <div className="px-3 py-2 text-xs text-slate-500">
            {query.trim() ? 'No document types match your search.' : 'NO DOCUMENT TYPES FOUND.'}
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
              {opt.document_name || opt.name}
            </button>
          ))
        )}
      </div>
    ) : null

  return (
    <>
      <div ref={containerRef} className={`relative ${className}`}>
        <input
          ref={inputRef}
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
              title="Clear document type"
              aria-label="Clear document type"
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
            title="Create new document type"
            aria-label="Create new document type"
          >
            +
          </button>
        </div>
      </div>

      {typeof document !== 'undefined' && menuEl ? createPortal(menuEl, document.body) : null}

      {showCreate ? (
        <CreateDocumentTypeModal
          onClose={() => setShowCreate(false)}
          onSuccess={handleCreated}
        />
      ) : null}
    </>
  )
}
