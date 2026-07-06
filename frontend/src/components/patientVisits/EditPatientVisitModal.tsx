import { useEffect, useRef, useState } from 'react'
import { ClipboardList } from 'lucide-react'
import {
  CM_BTN_OUTLINE_CANCEL,
  CM_BTN_OUTLINE_SAVE,
  CREATE_MODAL_BODY_GRADIENT,
  CREATE_MODAL_OVERLAY,
  CreateModalFooter,
  CreateModalHeader,
  MODAL_FIELD_CLASS,
  MODAL_LABEL_CLASS,
  MODAL_SECTION_CLASS,
  MODAL_SECTION_TITLE_CLASS,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import {
  linkComboboxDropdownClassShort,
  linkComboboxInputClass,
  linkComboboxOptionClass,
} from '../ui/linkComboboxStyles'
import {
  fetchPatientVisit,
  fetchPatientVisitTypes,
  updatePatientVisit,
  type PatientVisit,
  type PatientVisitTypeOption,
} from '../../services/patientVisits'
import { fetchHealthcarePractitioners, fetchCostCenters, type LinkFieldOption } from '../../services/common'
import { useCareContext } from '../../providers/CareContextProvider'
import { useBlockIfEditingLocked } from '../../hooks/useBlockIfEditingLocked'
import { useRejectEditModeWhenLocked } from '../../hooks/useRejectEditModeWhenLocked'
import { toast } from '../../hooks/useToast'

interface EditPatientVisitModalProps {
  visitName: string
  onClose: () => void
  onSuccess: () => void
}

function normalizeTime(value?: string | null): string {
  if (!value) return ''
  const parts = value.split(':')
  if (parts.length >= 2) return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`
  return value
}

export const EditPatientVisitModal = ({
  visitName,
  onClose,
  onSuccess,
}: EditPatientVisitModalProps) => {
  useRejectEditModeWhenLocked(true, onClose)
  const blockIfEditingLocked = useBlockIfEditingLocked()
  const { costCenterCompany } = useCareContext()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [visit, setVisit] = useState<PatientVisit | null>(null)

  const [practitioner, setPractitioner] = useState('')
  const [practQuery, setPractQuery] = useState('')
  const [practOptions, setPractOptions] = useState<LinkFieldOption[]>([])
  const [practOpen, setPractOpen] = useState(false)

  const [visitType, setVisitType] = useState('')
  const [visitTypeQuery, setVisitTypeQuery] = useState('')
  const [visitTypeOptions, setVisitTypeOptions] = useState<PatientVisitTypeOption[]>([])
  const [visitTypeOpen, setVisitTypeOpen] = useState(false)

  const [costCenter, setCostCenter] = useState('')
  const [costCenterQuery, setCostCenterQuery] = useState('')
  const [costCenterOptions, setCostCenterOptions] = useState<LinkFieldOption[]>([])
  const [costCenterOpen, setCostCenterOpen] = useState(false)

  const [encounterDate, setEncounterDate] = useState('')
  const [encounterTime, setEncounterTime] = useState('')
  const [encounterComment, setEncounterComment] = useState('')

  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchPatientVisit(visitName)
      .then((data) => {
        if (cancelled) return
        setVisit(data)
        setPractitioner(data.practitioner || '')
        setPractQuery(data.practitioner_name || data.practitioner || '')
        setVisitType(data.visit_type || '')
        setVisitTypeQuery(data.visit_type || '')
        setCostCenter(data.cost_center || '')
        setCostCenterQuery(data.cost_center || '')
        setEncounterDate(data.encounter_date || '')
        setEncounterTime(normalizeTime(data.encounter_time))
        setEncounterComment(data.encounter_comment || '')
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load visit')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [visitName])

  useEffect(() => {
    if (!practOpen && !practQuery) return
    const t = setTimeout(async () => {
      try {
        setPractOptions(await fetchHealthcarePractitioners(practQuery || undefined))
      } catch {
        setPractOptions([])
      }
    }, 300)
    return () => clearTimeout(t)
  }, [practOpen, practQuery])

  useEffect(() => {
    if (!visitTypeOpen) return
    const t = setTimeout(async () => {
      try {
        setVisitTypeOptions(await fetchPatientVisitTypes(visitTypeQuery || undefined))
      } catch {
        setVisitTypeOptions([])
      }
    }, visitTypeQuery.trim() ? 300 : 0)
    return () => clearTimeout(t)
  }, [visitTypeOpen, visitTypeQuery])

  useEffect(() => {
    if (!costCenterOpen) return
    fetchCostCenters(costCenterCompany, costCenterQuery || undefined)
      .then(setCostCenterOptions)
      .catch(() => setCostCenterOptions([]))
  }, [costCenterOpen, costCenterQuery, costCenterCompany])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPractOpen(false)
        setVisitTypeOpen(false)
        setCostCenterOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!visit) return
    setError(null)

    if (!practitioner) {
      setError('Practitioner is required')
      return
    }
    if (!encounterDate) {
      setError('Encounter date is required')
      return
    }
    if (!encounterTime) {
      setError('Encounter time is required')
      return
    }

    blockIfEditingLocked()
    setSaving(true)
    try {
      await updatePatientVisit(visit.name, {
        practitioner,
        encounter_date: encounterDate,
        encounter_time: encounterTime,
        visit_type: visitType || undefined,
        cost_center: costCenter || undefined,
        encounter_comment: encounterComment.trim() || undefined,
      })
      toast.success(`Visit ${visit.name} updated`)
      onSuccess()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update visit'
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  if (loading || !visit) {
    return (
      <div className={CREATE_MODAL_OVERLAY}>
        <div className={createModalShellClass('max-w-2xl w-full')}>
          <div className="px-6 py-10 text-center text-sm text-slate-500">
            {error || 'Loading visit…'}
          </div>
        </div>
      </div>
    )
  }

  if (visit.status === 'Cancelled') {
    return (
      <div className={CREATE_MODAL_OVERLAY}>
        <div className={createModalShellClass('max-w-md w-full')}>
          <CreateModalHeader
            title="Edit Patient Visit"
            subtitle={visit.name}
            icon={<ClipboardList className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
            onClose={onClose}
            alert="Cancelled visits cannot be edited."
          />
          <CreateModalFooter>
            <button type="button" onClick={onClose} className={CM_BTN_OUTLINE_CANCEL}>
              Close
            </button>
          </CreateModalFooter>
        </div>
      </div>
    )
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div ref={containerRef} className={createModalShellClass('max-w-2xl w-full max-h-[90vh]')}>
        <CreateModalHeader
          title="Edit Patient Visit"
          subtitle={`${visit.name} · ${visit.patient_name || visit.patient}`}
          icon={<ClipboardList className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
          onClose={onClose}
          alert={error}
        />

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className={`${CREATE_MODAL_BODY_GRADIENT} px-5 py-5 sm:px-6 space-y-5 overflow-y-auto`}>
            <section className={MODAL_SECTION_CLASS}>
              <h3 className={MODAL_SECTION_TITLE_CLASS}>Visit information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-600 mb-4">
                <div>
                  <span className="font-medium text-slate-700">Patient:</span>{' '}
                  {visit.patient_name || visit.patient}
                </div>
                <div>
                  <span className="font-medium text-slate-700">Status:</span> {visit.status}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="relative md:col-span-2">
                  <label className={MODAL_LABEL_CLASS}>
                    Practitioner <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={
                      practitioner
                        ? practOptions.find((p) => p.name === practitioner)?.label ||
                          practQuery ||
                          practitioner
                        : practQuery
                    }
                    onChange={(e) => {
                      setPractQuery(e.target.value)
                      setPractOpen(true)
                      if (practitioner) setPractitioner('')
                    }}
                    onFocus={() => setPractOpen(true)}
                    placeholder="Search practitioner..."
                    className={linkComboboxInputClass}
                    required
                  />
                  {practOpen && practOptions.length > 0 && (
                    <div className={linkComboboxDropdownClassShort}>
                      {practOptions.map((opt) => (
                        <button
                          key={opt.name}
                          type="button"
                          className={linkComboboxOptionClass}
                          onClick={() => {
                            setPractitioner(opt.name)
                            setPractQuery(opt.label)
                            setPractOpen(false)
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="relative">
                  <label className={MODAL_LABEL_CLASS}>Visit Type</label>
                  <input
                    type="text"
                    value={
                      visitType
                        ? visitTypeOptions.find((v) => v.name === visitType)?.visit_type ||
                          visitTypeQuery ||
                          visitType
                        : visitTypeQuery
                    }
                    onChange={(e) => {
                      setVisitTypeQuery(e.target.value)
                      setVisitTypeOpen(true)
                      if (visitType) setVisitType('')
                    }}
                    onFocus={() => setVisitTypeOpen(true)}
                    placeholder="Search visit type..."
                    className={linkComboboxInputClass}
                  />
                  {visitTypeOpen && visitTypeOptions.length > 0 && (
                    <div className={linkComboboxDropdownClassShort}>
                      {visitTypeOptions.map((opt) => (
                        <button
                          key={opt.name}
                          type="button"
                          className={linkComboboxOptionClass}
                          onClick={() => {
                            setVisitType(opt.name)
                            setVisitTypeQuery(opt.visit_type || opt.name)
                            setVisitTypeOpen(false)
                          }}
                        >
                          {opt.visit_type || opt.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="relative">
                  <label className={MODAL_LABEL_CLASS}>Branch</label>
                  <input
                    type="text"
                    value={
                      costCenter
                        ? costCenterOptions.find((c) => c.name === costCenter)?.label ||
                          costCenterQuery ||
                          costCenter
                        : costCenterQuery
                    }
                    onChange={(e) => {
                      setCostCenterQuery(e.target.value)
                      setCostCenterOpen(true)
                      setCostCenter('')
                    }}
                    onFocus={() => setCostCenterOpen(true)}
                    placeholder="Search branch..."
                    className={linkComboboxInputClass}
                  />
                  {costCenterOpen && costCenterOptions.length > 0 && (
                    <div className={linkComboboxDropdownClassShort}>
                      {costCenterOptions.map((opt) => (
                        <button
                          key={opt.name}
                          type="button"
                          className={linkComboboxOptionClass}
                          onClick={() => {
                            setCostCenter(opt.name)
                            setCostCenterQuery(opt.label || opt.name)
                            setCostCenterOpen(false)
                          }}
                        >
                          {opt.label || opt.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className={MODAL_LABEL_CLASS}>
                    Encounter Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={encounterDate}
                    onChange={(e) => setEncounterDate(e.target.value)}
                    className={MODAL_FIELD_CLASS}
                    required
                  />
                </div>

                <div>
                  <label className={MODAL_LABEL_CLASS}>
                    Encounter Time <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="time"
                    value={encounterTime}
                    onChange={(e) => setEncounterTime(e.target.value)}
                    className={MODAL_FIELD_CLASS}
                    required
                  />
                </div>

                <div className="md:col-span-2">
                  <label className={MODAL_LABEL_CLASS}>Review Details</label>
                  <textarea
                    value={encounterComment}
                    onChange={(e) => setEncounterComment(e.target.value)}
                    rows={4}
                    placeholder="Encounter comment / review details..."
                    className={`${MODAL_FIELD_CLASS} resize-y min-h-[96px]`}
                  />
                </div>
              </div>
            </section>
          </div>

          <CreateModalFooter>
            <button type="button" onClick={onClose} disabled={saving} className={CM_BTN_OUTLINE_CANCEL}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={CM_BTN_OUTLINE_SAVE}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </CreateModalFooter>
        </form>
      </div>
    </div>
  )
}
