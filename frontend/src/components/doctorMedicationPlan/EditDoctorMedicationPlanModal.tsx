import { useEffect, useState } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_BODY_GRADIENT,
  CREATE_MODAL_OVERLAY,
  CreateModalFooter,
  CreateModalHeader,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { FileText } from 'lucide-react'
import {
  fetchDoctorMedicationPlan,
  updateDoctorMedicationPlan,
} from '../../services/doctorMedicationPlan'
import {
  fetchHealthcarePractitioners,
  type LinkFieldOption,
} from '../../services/common'
import {
  linkComboboxDropdownClassTall,
  linkComboboxInputWithClearClass,
  linkComboboxOptionClass,
} from '../ui/linkComboboxStyles'
import { toast } from '../../hooks/useToast'
import { CreatePractitionerModal } from '../practitioners/CreatePractitionerModal'

function stripHtml(html: string): string {
  if (!html) return ''
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  return tmp.textContent || tmp.innerText || ''
}

function postingDateForInput(posting?: string): string {
  if (!posting) return new Date().toISOString().slice(0, 16)
  const s = String(posting).trim()
  if (s.includes('T')) return s.slice(0, 16)
  return s.replace(' ', 'T').slice(0, 16)
}

interface EditDoctorMedicationPlanModalProps {
  planName: string
  onClose: () => void
  onSuccess?: () => void
}

export const EditDoctorMedicationPlanModal = ({
  planName,
  onClose,
  onSuccess,
}: EditDoctorMedicationPlanModalProps) => {
  const [loadingDoc, setLoadingDoc] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [patientId, setPatientId] = useState('')
  const [visitRef, setVisitRef] = useState('')
  const [formData, setFormData] = useState({
    practitioner: '',
    posting_date: '',
    plan: '',
    recommendation: '',
    reception_note: '',
  })

  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])
  const [filteredPractitionerOptions, setFilteredPractitionerOptions] = useState<LinkFieldOption[]>([])
  const [practitionerOpen, setPractitionerOpen] = useState(false)
  const [practitionerQuery, setPractitionerQuery] = useState('')
  const [showCreatePractitioner, setShowCreatePractitioner] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoadingDoc(true)
      setError(null)
      try {
        const [doc, practs] = await Promise.all([
          fetchDoctorMedicationPlan(planName),
          fetchHealthcarePractitioners(),
        ])
        if (cancelled) return
        setPractitionerOptions(practs)
        setFilteredPractitionerOptions(practs)

        setPatientId(doc.patient || '')
        setVisitRef(doc.reference_document || doc.reference_name || '')

        const pr = doc.practitioner || ''
        const prOpt = practs.find((p) => p.name === pr)
        setPractitionerQuery(prOpt?.label || pr)

        setFormData({
          practitioner: pr,
          posting_date: postingDateForInput(doc.posting_date),
          plan: stripHtml(doc.plan || ''),
          recommendation: stripHtml(doc.recommendation || ''),
          reception_note: stripHtml(doc.reception_note || ''),
        })
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load plan')
        }
      } finally {
        if (!cancelled) setLoadingDoc(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [planName])

  useEffect(() => {
    if (!practitionerOpen) return
    const timeoutId = setTimeout(() => {
      if (!practitionerQuery.trim()) {
        setFilteredPractitionerOptions(practitionerOptions)
      } else {
        const q = practitionerQuery.toLowerCase()
        setFilteredPractitionerOptions(
          practitionerOptions.filter((p) => p.label.toLowerCase().includes(q))
        )
      }
    }, 300)
    return () => clearTimeout(timeoutId)
  }, [practitionerQuery, practitionerOpen, practitionerOptions])

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handlePractitionerSelect = (pr: LinkFieldOption) => {
    setFormData((prev) => ({ ...prev, practitioner: pr.name }))
    setPractitionerQuery(pr.label)
    setPractitionerOpen(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.plan.trim()) {
      setError('Plan is required')
      return
    }
    try {
      setSaving(true)
      setError(null)
      await updateDoctorMedicationPlan(planName, {
        practitioner: formData.practitioner || undefined,
        posting_date: formData.posting_date || undefined,
        plan: formData.plan.trim(),
        recommendation: formData.recommendation.trim() || undefined,
        reception_note: formData.reception_note.trim() || undefined,
      })
      toast.success("Doctor's plan updated")
      onSuccess?.()
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update plan'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const submitDisabled =
    saving || loadingDoc || !formData.plan.trim()

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-2xl w-full max-h-[90vh]')}>
        <CreateModalHeader
          title="Edit Doctor's Plan"
          icon={<FileText className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
          subtitle={planName}
          onClose={onClose}
        />

        {loadingDoc ? (
          <div className="p-12 text-center text-slate-600">Loading…</div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className={`${CREATE_MODAL_BODY_GRADIENT} flex flex-col flex-1 min-h-0`}
            onClick={(e) => {
              const target = e.target as HTMLElement
              if (target.tagName !== 'INPUT' && !target.closest('.absolute')) {
                setPractitionerOpen(false)
              }
            }}
          >
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Patient</label>
                <input
                  type="text"
                  value={patientId}
                  readOnly
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-100 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Patient visit</label>
                <input
                  type="text"
                  value={visitRef}
                  readOnly
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-100 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Practitioner</label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={practitionerQuery}
                    onChange={(e) => {
                      setPractitionerQuery(e.target.value)
                      setPractitionerOpen(true)
                    }}
                    onFocus={() => setPractitionerOpen(true)}
                    placeholder="Search practitioner..."
                    className={linkComboboxInputWithClearClass}
                  />
                  <button
                    type="button"
                    className="ml-2 text-xs text-primary whitespace-nowrap"
                    onClick={() => setShowCreatePractitioner(true)}
                  >
                    + New
                  </button>
                  {practitionerOpen && filteredPractitionerOptions.length > 0 && (
                    <div className={`${linkComboboxDropdownClassTall} top-full left-0`}>
                      {filteredPractitionerOptions.map((pr) => (
                        <button
                          key={pr.name}
                          type="button"
                          onClick={() => handlePractitionerSelect(pr)}
                          className={linkComboboxOptionClass}
                        >
                          <div>
                            <div className="font-medium">{pr.label}</div>
                            <div className="text-xs text-slate-500">{pr.name}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Posting Date</label>
                <input
                  type="datetime-local"
                  value={formData.posting_date}
                  onChange={(e) => handleChange('posting_date', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Plan <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={formData.plan}
                  onChange={(e) => handleChange('plan', e.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Recommendation</label>
                <textarea
                  value={formData.recommendation}
                  onChange={(e) => handleChange('recommendation', e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Reception Note</label>
                <textarea
                  value={formData.reception_note}
                  onChange={(e) => handleChange('reception_note', e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            <CreateModalFooter>
              <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>Cancel</button>
              <button type="submit" disabled={submitDisabled} className={CM_BTN_PRIMARY}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </CreateModalFooter>
          </form>
        )}
      </div>

      {showCreatePractitioner && (
        <CreatePractitionerModal
          onClose={() => setShowCreatePractitioner(false)}
          onSuccess={(practitionerName) => {
            setFormData((prev) => ({ ...prev, practitioner: practitionerName }))
            fetchHealthcarePractitioners()
              .then((results) => {
                setPractitionerOptions(results)
                setFilteredPractitionerOptions(results)
                const opt = results.find((p) => p.name === practitionerName)
                if (opt) setPractitionerQuery(opt.label)
              })
              .catch(() => {})
            setPractitionerOpen(false)
            setShowCreatePractitioner(false)
          }}
        />
      )}
    </div>
  )
}
