import { useState, useCallback } from 'react'
import { apiRequest } from '../../services/apiClient'

interface Opt { name: string }

interface CreateLabTestSampleModalProps {
  onClose: () => void
  onSuccess?: () => void
}

function LinkField({
  label, required, query, opts, open,
  onFocus, onChange, onSelect, onClear, setOpen,
}: {
  label: string
  required?: boolean
  query: string
  opts: Opt[]
  open: boolean
  onFocus: () => void
  onChange: (q: string) => void
  onSelect: (name: string) => void
  onClear: () => void
  setOpen: (v: boolean) => void
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={e => { onChange(e.target.value); setOpen(true) }}
          onFocus={() => { setOpen(true); onFocus() }}
          placeholder={`Search ${label}…`}
          className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary pr-7"
        />
        {query && (
          <button type="button" onClick={onClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs">✕</button>
        )}
        {open && opts.length > 0 && (
          <div className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded shadow-lg max-h-44 overflow-y-auto">
            {opts.map(o => (
              <button key={o.name} type="button"
                onClick={() => { onSelect(o.name); setOpen(false) }}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-100">
                {o.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export const CreateLabTestSampleModal = ({ onClose, onSuccess }: CreateLabTestSampleModalProps) => {
  const [sampleName, setSampleName] = useState('')

  const [sampleType, setSampleType] = useState('')
  const [sampleTypeQuery, setSampleTypeQuery] = useState('')
  const [sampleTypeOpts, setSampleTypeOpts] = useState<Opt[]>([])
  const [sampleTypeOpen, setSampleTypeOpen] = useState(false)

  const [sampleUom, setSampleUom] = useState('')
  const [uomQuery, setUomQuery] = useState('')
  const [uomOpts, setUomOpts] = useState<Opt[]>([])
  const [uomOpen, setUomOpen] = useState(false)

  const [containerColor, setContainerColor] = useState('')
  const [colorQuery, setColorQuery] = useState('')
  const [colorOpts, setColorOpts] = useState<Opt[]>([])
  const [colorOpen, setColorOpen] = useState(false)

  const [collectionDetails, setCollectionDetails] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSampleTypes = useCallback(async (q?: string) => {
    try {
      const filters = q ? `[["name","like","%${q}%"]]` : '[]'
      const res = await apiRequest<{ data: Opt[] }>(
        `/api/resource/Sample%20Type?fields=${encodeURIComponent('["name"]')}&filters=${encodeURIComponent(filters)}&limit_page_length=30&order_by=name+asc`
      )
      setSampleTypeOpts(res.data || [])
    } catch { setSampleTypeOpts([]) }
  }, [])

  const loadUoms = useCallback(async (q?: string) => {
    try {
      const filters = q ? `[["name","like","%${q}%"]]` : '[]'
      const res = await apiRequest<{ data: Opt[] }>(
        `/api/resource/Lab%20Test%20UOM?fields=${encodeURIComponent('["name"]')}&filters=${encodeURIComponent(filters)}&limit_page_length=30&order_by=name+asc`
      )
      setUomOpts(res.data || [])
    } catch { setUomOpts([]) }
  }, [])

  const loadColors = useCallback(async (q?: string) => {
    try {
      const filters = q ? `[["name","like","%${q}%"]]` : '[]'
      const res = await apiRequest<{ data: Opt[] }>(
        `/api/resource/Color?fields=${encodeURIComponent('["name"]')}&filters=${encodeURIComponent(filters)}&limit_page_length=30&order_by=name+asc`
      )
      setColorOpts(res.data || [])
    } catch { setColorOpts([]) }
  }, [])

  const closeAll = () => {
    setSampleTypeOpen(false); setUomOpen(false); setColorOpen(false)
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
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create sample')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]"
        onClick={e => { e.stopPropagation(); closeAll() }}>

        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <h2 className="text-lg font-semibold text-slate-900">Create Lab Test Sample</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
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

            {/* Sample Type — Link: Sample Type */}
            <div onClick={e => e.stopPropagation()}>
              <LinkField
                label="Sample Type"
                query={sampleTypeQuery} opts={sampleTypeOpts}
                open={sampleTypeOpen} setOpen={setSampleTypeOpen}
                onFocus={() => loadSampleTypes()}
                onChange={q => { setSampleTypeQuery(q); setSampleType(''); loadSampleTypes(q) }}
                onSelect={name => { setSampleType(name); setSampleTypeQuery(name) }}
                onClear={() => { setSampleType(''); setSampleTypeQuery('') }}
              />
            </div>

            {/* UOM — Link: Lab Test UOM */}
            <div onClick={e => e.stopPropagation()}>
              <LinkField
                label="UOM"
                query={uomQuery} opts={uomOpts}
                open={uomOpen} setOpen={setUomOpen}
                onFocus={() => loadUoms()}
                onChange={q => { setUomQuery(q); setSampleUom(''); loadUoms(q) }}
                onSelect={name => { setSampleUom(name); setUomQuery(name) }}
                onClear={() => { setSampleUom(''); setUomQuery('') }}
              />
            </div>

            {/* Container Closure Color — Link: Color */}
            <div onClick={e => e.stopPropagation()}>
              <LinkField
                label="Container Closure Color"
                query={colorQuery} opts={colorOpts}
                open={colorOpen} setOpen={setColorOpen}
                onFocus={() => loadColors()}
                onChange={q => { setColorQuery(q); setContainerColor(''); loadColors(q) }}
                onSelect={name => { setContainerColor(name); setColorQuery(name) }}
                onClear={() => { setContainerColor(''); setColorQuery('') }}
              />
            </div>

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
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50">
                {saving ? 'Creating…' : 'Create Sample'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
