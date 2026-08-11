import { useState, useEffect, useRef, useCallback } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  CREATE_MODAL_OVERLAY_STACK,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { apiRequest } from '../../services/apiClient'
import { fetchUoms, fetchSampleTypes, fetchColors, type LinkFieldOption } from '../../services/common'

interface CreateLabTestSampleModalProps {
  onClose: () => void
  onSuccess?: (sampleName?: string) => void
}

/* ─── Self-contained link field with + button inside ───────── */
function SelfLink({
  label, value, fetchFn, onChange, onCreateClick,
}: {
  label: string
  value: string
  fetchFn: (q?: string) => Promise<LinkFieldOption[]>
  onChange: (name: string) => void
  onCreateClick: () => void
}) {
  const [query, setQuery] = useState(value)
  const [options, setOptions] = useState<LinkFieldOption[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setQuery(value)
  }, [value])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      fetchFn(query || undefined).then(setOptions).catch(() => setOptions([]))
    }, query ? 250 : 0)
    return () => clearTimeout(t)
  }, [query, open, fetchFn])

  const select = (opt: LinkFieldOption) => {
    setQuery(opt.label)
    onChange(opt.name)
    setOpen(false)
  }

  const clear = () => {
    setQuery('')
    onChange('')
    setOpen(false)
  }

  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <div className="relative" ref={ref}>
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); if (e.target.value !== query) onChange('') }}
          onFocus={() => setOpen(true)}
          placeholder={`Search ${label}…`}
          className="w-full rounded border border-slate-300 pr-8 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {query ? (
          <button type="button" onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs">✕</button>
        ) : (
          <button type="button" onClick={onCreateClick}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white border border-primary/40 text-primary flex items-center justify-center text-sm leading-none hover:bg-primary/5"
            title={`Create ${label}`}>+</button>
        )}
        {open && options.length > 0 && (
          <div className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded shadow-lg max-h-44 overflow-y-auto">
            {options.map(o => (
              <button key={o.name} type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => select(o)}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-100">{o.label}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Mini inline create modal ─────────────────────────────── */
function CreateMiniModal({
  title, label, placeholder, saving, onClose, onSave,
}: {
  title: string
  label: string
  placeholder?: string
  saving: boolean
  onClose: () => void
  onSave: (name: string) => void
}) {
  const [value, setValue] = useState('')
  return (
    <div className={CREATE_MODAL_OVERLAY_STACK}
      onClick={onClose}>
      <div className={createModalShellClass('w-full max-w-sm p-6')} onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-slate-900 mb-4">{title}</h3>
        <div className="mb-4">
          <label className="block text-xs font-medium text-slate-600 mb-1">{label} <span className="text-red-500">*</span></label>
          <input
            type="text" value={value} onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (value.trim()) onSave(value.trim()) } }}
            placeholder={placeholder}
            autoFocus
            className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose}
            className={CM_BTN_CANCEL}>Cancel</button>
          <button type="button" onClick={() => { if (value.trim()) onSave(value.trim()) }} disabled={saving || !value.trim()}
            className={CM_BTN_PRIMARY}>
            {saving ? 'Creating…' : `Create ${title.replace('Create ', '')}`}
          </button>
        </div>
      </div>
    </div>
  )
}

export const CreateLabTestSampleModal = ({ onClose, onSuccess }: CreateLabTestSampleModalProps) => {
  const [sampleName, setSampleName] = useState('')
  const [sampleType, setSampleType] = useState('')
  const [sampleUom, setSampleUom] = useState('')
  const [containerColor, setContainerColor] = useState('')
  const [collectionDetails, setCollectionDetails] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Create sub-modals
  const [createModal, setCreateModal] = useState<'uom' | 'sample_type' | 'color' | null>(null)
  const [creatingSubItem, setCreatingSubItem] = useState(false)

  const fetchUomsCb = useCallback((q?: string) => fetchUoms(q), [])
  const fetchSampleTypesCb = useCallback((q?: string) => fetchSampleTypes(q), [])
  const fetchColorsCb = useCallback((q?: string) => fetchColors(q), [])

  const handleCreateSubItem = async (name: string) => {
    setCreatingSubItem(true)
    try {
      let endpoint = ''
      let paramKey = ''
      if (createModal === 'uom') { endpoint = 'create_uom'; paramKey = 'uom_name' }
      else if (createModal === 'sample_type') { endpoint = 'create_sample_type'; paramKey = 'type_name' }
      else if (createModal === 'color') { endpoint = 'create_color'; paramKey = 'color_name' }
      if (!endpoint) return

      const params = new URLSearchParams()
      params.set(paramKey, name)
      const res = await fetch(`/api/method/healthcare.api.common.${endpoint}?${params.toString()}`, { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) { alert(data.message || 'Failed to create record'); return }

      const created: LinkFieldOption = data.message
      if (createModal === 'uom') setSampleUom(created.name)
      else if (createModal === 'sample_type') setSampleType(created.name)
      else if (createModal === 'color') setContainerColor(created.name)
      setCreateModal(null)
    } finally {
      setCreatingSubItem(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sampleName.trim()) { setError('Sample name is required'); return }
    try {
      setSaving(true)
      setError(null)
      await apiRequest('/api/resource/Lab%20Test%20Sample', {
        method: 'POST',
        body: JSON.stringify({
          sample: sampleName.trim(),
          sample_type: sampleType || null,
          sample_uom: sampleUom || null,
          container_closure_color: containerColor || null,
          collection_details: collectionDetails || null,
        }),
      })
      onSuccess?.(sampleName.trim())
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create sample')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
    <div className={CREATE_MODAL_OVERLAY}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={createModalShellClass('w-full max-w-lg flex flex-col max-h-[90vh]')}
        onClick={e => e.stopPropagation()}>

        <div className="relative shrink-0 border-b border-emerald-100/60 bg-gradient-to-r from-emerald-100 via-teal-50 to-sky-100 px-6 py-4 flex flex-shrink-0 items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-emerald-950">Create Lab Test Sample</h2>
          <button onClick={onClose} className="shrink-0 rounded-lg p-2 text-emerald-800/70 transition hover:bg-emerald-200/50 hover:text-emerald-950">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4" style={{ scrollbarWidth: 'thin' }}>

            {/* Sample Name */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Sample Name <span className="text-red-500">*</span>
              </label>
              <input type="text" value={sampleName} onChange={e => setSampleName(e.target.value)}
                placeholder="e.g. Blood - EDTA"
                className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>

            {/* Sample Type */}
            <SelfLink
              label="Sample Type"
              value={sampleType}
              fetchFn={fetchSampleTypesCb}
              onChange={setSampleType}
              onCreateClick={() => setCreateModal('sample_type')}
            />

            {/* UOM — Lab Test UOM */}
            <SelfLink
              label="UOM"
              value={sampleUom}
              fetchFn={fetchUomsCb}
              onChange={setSampleUom}
              onCreateClick={() => setCreateModal('uom')}
            />

            {/* Container Closure Color */}
            <SelfLink
              label="Container Closure Color"
              value={containerColor}
              fetchFn={fetchColorsCb}
              onChange={setContainerColor}
              onCreateClick={() => setCreateModal('color')}
            />

            {/* Collection Instructions */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Collection Instructions</label>
              <textarea value={collectionDetails} onChange={e => setCollectionDetails(e.target.value)}
                rows={4} placeholder="e.g. Collect 5 mL in EDTA tube, invert 8 times, keep at 4°C"
                className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
            </div>
          </div>

          <div className="px-6 py-4 border-t border-slate-200 flex-shrink-0">
            {error && (
              <div className="mb-3 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>
            )}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={onClose}
                className={CM_BTN_CANCEL}>
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className={CM_BTN_PRIMARY}>
                {saving ? 'Creating…' : 'Create Sample'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>

    {createModal && (
      <CreateMiniModal
        title={createModal === 'uom' ? 'Create UOM' : createModal === 'sample_type' ? 'Create Sample Type' : 'Create Color'}
        label={createModal === 'uom' ? 'UOM Name' : createModal === 'sample_type' ? 'Sample Type Name' : 'Color Name'}
        placeholder={createModal === 'uom' ? 'e.g. mL, mg, Units' : createModal === 'sample_type' ? 'e.g. Venous Blood' : 'e.g. Red, Purple, Green'}
        saving={creatingSubItem}
        onClose={() => setCreateModal(null)}
        onSave={handleCreateSubItem}
      />
    )}
    </>
  )
}
