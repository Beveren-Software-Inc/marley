import { useState, useEffect, useRef } from 'react'
import { Stethoscope } from 'lucide-react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_BODY_GRADIENT,
  CREATE_MODAL_FOOTER_STICKY,
  CREATE_MODAL_OVERLAY_STACK,
  CreateModalHeader,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import {
  createDiagnosis,
  fetchDiagnosisGroups,
  type LinkFieldOption,
} from '../../services/common'
import { toast } from '../../hooks/useToast'

export interface CreateDiagnosisModalProps {
  onClose: () => void
  onSuccess: (created: LinkFieldOption) => void
  /** Prefill diagnosis name from search text */
  initialDiagnosis?: string
}

export function CreateDiagnosisModal({
  onClose,
  onSuccess,
  initialDiagnosis = '',
}: CreateDiagnosisModalProps) {
  const [diagnosis, setDiagnosis] = useState(initialDiagnosis)
  const [diseaseNo, setDiseaseNo] = useState('')
  const [groupQuery, setGroupQuery] = useState('')
  const [groupOptions, setGroupOptions] = useState<LinkFieldOption[]>([])
  const [selectedGroup, setSelectedGroup] = useState<LinkFieldOption | null>(null)
  const [groupOpen, setGroupOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const groupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (groupRef.current && !groupRef.current.contains(e.target as Node)) {
        setGroupOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (!groupOpen) return
    const t = setTimeout(() => {
      fetchDiagnosisGroups(groupQuery || undefined)
        .then(setGroupOptions)
        .catch(() => setGroupOptions([]))
    }, groupQuery.trim() ? 300 : 0)
    return () => clearTimeout(t)
  }, [groupQuery, groupOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!diagnosis.trim()) {
      setError('Diagnosis name is required')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const created = await createDiagnosis({
        diagnosis: diagnosis.trim(),
        disease_no: diseaseNo.trim() || undefined,
        diagnosis_group: selectedGroup?.name,
      })
      toast.success('Diagnosis created')
      onSuccess(created)
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create diagnosis'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY_STACK} onClick={onClose}>
      <div
        className={createModalShellClass('max-w-lg w-full max-h-[90vh] overflow-hidden')}
        onClick={(e) => e.stopPropagation()}
      >
        <CreateModalHeader
          title="Create Diagnosis"
          subtitle="Add a new diagnosis template for use on visits and admissions"
          icon={<Stethoscope className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
          onClose={onClose}
        />

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className={`${CREATE_MODAL_BODY_GRADIENT} px-5 py-4 sm:px-6 space-y-4`}>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Diagnosis <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                placeholder="e.g. Major depressive disorder, recurrent"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Disease No
              </label>
              <input
                type="text"
                value={diseaseNo}
                onChange={(e) => setDiseaseNo(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                placeholder="Optional — auto-generated if blank"
              />
              <p className="text-xs text-slate-500 mt-1">Unique code used as the Diagnosis ID in Desk.</p>
            </div>

            <div ref={groupRef} className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Diagnosis Group
              </label>
              <input
                type="text"
                value={selectedGroup ? selectedGroup.label : groupQuery}
                onChange={(e) => {
                  setGroupQuery(e.target.value)
                  setSelectedGroup(null)
                  setGroupOpen(true)
                }}
                onFocus={() => {
                  setGroupOpen(true)
                  fetchDiagnosisGroups(undefined).then(setGroupOptions).catch(() => {})
                }}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                placeholder="Search diagnosis group (optional)…"
              />
              {selectedGroup && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedGroup(null)
                    setGroupQuery('')
                  }}
                  className="absolute right-2 top-8 text-xs text-slate-500 hover:text-slate-700"
                >
                  Clear
                </button>
              )}
              {groupOpen && groupOptions.length > 0 && (
                <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-y-auto">
                  {groupOptions.map((g) => (
                    <button
                      key={g.name}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-50"
                      onMouseDown={() => {
                        setSelectedGroup(g)
                        setGroupQuery('')
                        setGroupOpen(false)
                      }}
                    >
                      {g.label || g.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>

          <div className={`${CREATE_MODAL_FOOTER_STICKY} justify-end`}>
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>
              Cancel
            </button>
            <button type="submit" disabled={loading} className={CM_BTN_PRIMARY}>
              {loading ? 'Creating…' : 'Create Diagnosis'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
