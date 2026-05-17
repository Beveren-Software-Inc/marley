import { useEffect, useRef, useState } from 'react'
import { fetchLabTechnicianPractitioners, type LinkFieldOption } from '../../services/common'
import { canEditLabTestResults } from '../../config/permissions'
import { useCareContext } from '../../providers/CareContextProvider'

export type LabTestResultsSaveHeaderProps = {
  pendingCount: number
  batchSaving: boolean
  batchLabTechnician: string
  batchLabTechnicianLabel: string
  onBatchLabTechnicianChange: (id: string, label: string) => void
  onSave: () => void | Promise<void>
  showAddButton?: boolean
  onAdd?: () => void
  addTitle?: string
}

export function LabTestResultsSaveHeader({
  pendingCount,
  batchSaving,
  batchLabTechnician,
  batchLabTechnicianLabel,
  onBatchLabTechnicianChange,
  onSave,
  showAddButton = true,
  onAdd,
  addTitle = 'Add Lab Test',
}: LabTestResultsSaveHeaderProps) {
  const { userRole } = useCareContext()
  const canEdit = canEditLabTestResults(userRole)
  const [query, setQuery] = useState(batchLabTechnicianLabel)
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<LinkFieldOption[]>([])
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setQuery(batchLabTechnicianLabel || batchLabTechnician)
  }, [batchLabTechnician, batchLabTechnicianLabel])

  useEffect(() => {
    if (!canEdit) return
    const t = setTimeout(() => {
      fetchLabTechnicianPractitioners(query.trim() || undefined)
        .then(setOptions)
        .catch(() => setOptions([]))
    }, query.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [query, canEdit])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  if (!canEdit) {
    return showAddButton && onAdd ? (
      <button
        type="button"
        onClick={onAdd}
        className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 text-sm font-bold"
        title={addTitle}
      >
        +
      </button>
    ) : null
  }

  return (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      <div ref={wrapRef} className="relative min-w-[200px] max-w-[280px]">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            onBatchLabTechnicianChange('', '')
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder="Default lab tech (optional)"
          className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {open && (
          <div className="absolute right-0 z-50 mt-1 w-full max-h-48 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
            {options.length === 0 ? (
              <div className="px-2 py-2 text-xs text-slate-500">No matches</div>
            ) : (
              options.map((opt) => (
                <button
                  key={opt.name}
                  type="button"
                  className="w-full text-left px-2 py-2 text-sm hover:bg-slate-100 border-b border-slate-50 last:border-0"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onBatchLabTechnicianChange(opt.name, opt.label || opt.name)
                    setQuery(opt.label || opt.name)
                    setOpen(false)
                  }}
                >
                  {opt.label || opt.name}
                </button>
              ))
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        disabled={batchSaving || pendingCount === 0}
        onClick={() => void onSave()}
        className="px-3 py-1 text-sm font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
        title={pendingCount === 0 ? 'Edit results in the table, then save' : `Save ${pendingCount} changed result(s)`}
      >
        {batchSaving ? 'Saving…' : pendingCount > 0 ? `Save (${pendingCount})` : 'Save'}
      </button>
      {showAddButton && onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 text-sm font-bold flex-shrink-0"
          title={addTitle}
        >
          +
        </button>
      )}
    </div>
  )
}
