import { useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchIOPHealthcareServiceTemplates,
  type IOPHealthcareServiceTemplate,
} from '../../services/iop'
import {
  linkComboboxDropdownClassShort,
  linkComboboxInputClassCompact,
  linkComboboxOptionClassCompact,
} from './linkComboboxStyles'

interface IOPHealthcareServiceTemplateSelectProps {
  value: string
  onChange: (value: string) => void
  templates?: IOPHealthcareServiceTemplate[]
  onTemplatesUpdated?: (templates: IOPHealthcareServiceTemplate[]) => void
  className?: string
  placeholder?: string
}

export function IOPHealthcareServiceTemplateSelect({
  value,
  onChange,
  templates: templatesProp,
  onTemplatesUpdated,
  className = '',
  placeholder = 'Search healthcare service...',
}: IOPHealthcareServiceTemplateSelectProps) {
  const [internalTemplates, setInternalTemplates] = useState<IOPHealthcareServiceTemplate[]>([])
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const templates = templatesProp ?? internalTemplates

  useEffect(() => {
    if (templatesProp) return
    fetchIOPHealthcareServiceTemplates()
      .then(setInternalTemplates)
      .catch(() => setInternalTemplates([]))
  }, [templatesProp])

  useEffect(() => {
    if (!value) return
    const match = templates.find((t) => t.name === value)
    if (match) setQuery(match.service_name || match.name)
  }, [value, templates])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const updateTemplates = (next: IOPHealthcareServiceTemplate[]) => {
    if (templatesProp && onTemplatesUpdated) onTemplatesUpdated(next)
    else setInternalTemplates(next)
  }

  const filteredTemplates = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return templates
    return templates.filter(
      (t) =>
        (t.service_name || t.name).toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        (t.category || '').toLowerCase().includes(q),
    )
  }, [templates, query])

  const handleSelect = (opt: IOPHealthcareServiceTemplate) => {
    onChange(opt.name)
    setQuery(opt.service_name || opt.name)
    setOpen(false)
  }

  const handleClear = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onChange('')
    setQuery('')
    setOpen(false)
  }

  const handleSearch = (search: string) => {
    setQuery(search)
    if (value) onChange('')
    setOpen(true)
    // Filter locally first; refresh options from server without wiping the typed query.
    const q = search.trim()
    if (!q) {
      fetchIOPHealthcareServiceTemplates()
        .then((rows) => updateTemplates(rows))
        .catch(() => {})
      return
    }
    fetchIOPHealthcareServiceTemplates(q)
      .then((rows) => updateTemplates(rows))
      .catch(() => {})
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        type="text"
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className={`${linkComboboxInputClassCompact} pr-8 hover:border-emerald-300/80`}
        autoComplete="off"
      />
      {value ? (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
          title="Clear healthcare service"
          aria-label="Clear healthcare service"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      ) : null}

      {open ? (
        <div className={linkComboboxDropdownClassShort}>
          {filteredTemplates.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500">
              {query.trim() ? 'No healthcare services match your search.' : 'No healthcare services found.'}
            </div>
          ) : (
            filteredTemplates.map((opt) => (
              <button
                key={opt.name}
                type="button"
                className={`${linkComboboxOptionClassCompact} ${
                  value === opt.name ? 'bg-emerald-50/90 font-medium text-emerald-900' : ''
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(opt)}
              >
                <span>{opt.service_name || opt.name}</span>
                {opt.rate != null && opt.rate > 0 ? (
                  <span className="ml-2 text-[10px] text-slate-500">{opt.rate}</span>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}
